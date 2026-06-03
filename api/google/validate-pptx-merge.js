// ═══════════════════════════════════════════════════════════
//  POST /api/google/validate-pptx-merge
//  Authenticated PPTX merge validation against live canonical files.
//  Scans the canonical components folder, downloads selected PPTX files,
//  runs slide extraction + merge fidelity checks, returns a report.
// ═══════════════════════════════════════════════════════════

const CANONICAL_COMPONENTS_FOLDER_ID = process.env.CANONICAL_COMPONENTS_FOLDER_ID || "";

// Target files to validate (basename without .pptx)
const TARGET_FILES = [
  "canonical_why_brinc",
  "canonical_gcc_impact",
  "canonical_global_network",
];

// ── HTTP Helper ───────────────────────────────────────────

function gapi(token, url, init) {
  return fetch(url, Object.assign({}, init, {
    headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
  })).then(function(r) {
    return r.text().then(function(t) {
      var data = {};
      var body = t || "";
      var contentType = r.headers.get("content-type") || "";
      try { data = t ? JSON.parse(t) : {}; } catch(e) {}
      return { ok: r.ok, status: r.status, contentType: contentType, data: data, body: body.substring(0, 2000) };
    });
  });
}

// ── Logger ────────────────────────────────────────────────

function createLogger() {
  var logs = [];
  return {
    log: function(msg) { var line = "[VAL] " + msg; logs.push(line); console.log(line); },
    getLogs: function() { return logs; },
  };
}

// ── Drive Operations ──────────────────────────────────────

function scanCanonicalFolder(folderId, token, logger) {
  logger.log("CANONICAL_FOLDER_ID=" + folderId);

  // Phase 1: Broad scan — ALL files in folder (debug visibility)
  var broadQ = "'" + folderId + "' in parents and trashed=false";
  var broadUrl = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(broadQ)
    + "&fields=files(id,name,mimeType,size,modifiedTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true"
    + "&corpora=allDrives";
  logger.log("Broad query: " + broadUrl.substring(0, 200) + "...");

  return gapi(token, broadUrl).then(function(broadResult) {
    if (!broadResult.ok) {
      logger.log("Broad scan failed: HTTP " + broadResult.status + " body=" + broadResult.body.substring(0, 300));
    }
    var allFiles = (broadResult.data.files || []);
    logger.log("ALL_FILES_IN_FOLDER: " + allFiles.length);
    allFiles.forEach(function(f) {
      logger.log("  FILE: name=" + (f.name || "null") + " mime=" + (f.mimeType || "null") + " id=" + (f.id || "null").substring(0, 12));
    });

    // Phase 2: Filtered scan — PPTX + Google Slides only
    var q = "'" + folderId + "' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' or mimeType='application/vnd.google-apps.presentation')";
    var filteredUrl = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q)
      + "&fields=files(id,name,mimeType,size,modifiedTime)"
      + "&pageSize=100"
      + "&supportsAllDrives=true"
      + "&includeItemsFromAllDrives=true"
      + "&corpora=allDrives";
    logger.log("Filtered query: " + filteredUrl.substring(0, 200) + "...");

    return gapi(token, filteredUrl).then(function(result) {
      if (!result.ok) {
        logger.log("Filtered scan failed: HTTP " + result.status + " body=" + result.body.substring(0, 300));
        return { allFiles: allFiles, pptxFiles: [] };
      }
      var pptxFiles = (result.data.files || []).map(function(f) {
        return {
          id: f.id,
          name: f.name || "",
          mimeType: f.mimeType,
          size: f.size || "unknown",
          modifiedTime: f.modifiedTime || "",
          baseName: (f.name || "").toLowerCase().replace(/\.pptx$/, "").replace(/\.ppt$/, "").trim(),
        };
      });
      logger.log("PPTX_FILTERED_COUNT: " + pptxFiles.length);
      return { allFiles: allFiles, pptxFiles: pptxFiles };
    });
  });
}

function downloadFile(fileId, token, logger) {
  logger.log("Downloading: " + fileId.substring(0, 12) + "...");
  return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true&includeItemsFromAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) {
    logger.log("Download HTTP: " + r.status);
    if (!r.ok) {
      var errMsg = "Download failed: HTTP " + r.status;
      return r.text().then(function(body) {
        logger.log("Download error body: " + body.substring(0, 200));
        throw new Error(errMsg);
      });
    }
    return r.arrayBuffer();
  });
}

// ── PPTX Validation Core ──────────────────────────────────

async function validatePptxMerge(buffer, fileName, logger) {
  var startTime = Date.now();
  var report = {
    fileName: fileName,
    sourceSize: buffer.byteLength,
    slideCount: 0,
    mediaCount: 0,
    relationships: [],
    mergeTest: null,
    fidelity: null,
    errors: [],
  };

  try {
    // Dynamic import for ESM compatibility
    var JSZipModule = await import("jszip");
    var JSZip = JSZipModule.default || JSZipModule;
    var { XMLParser } = await import("fast-xml-parser");
    var parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

    var zip = await JSZip.loadAsync(buffer);

    // 1. Inspect structure
    var allFiles = Object.keys(zip.files).sort();
    logger.log("Total files in ZIP: " + allFiles.length);

    var slideFiles = allFiles.filter(function(f) { return /^ppt\/slides\/slide\d+\.xml$/.test(f); });
    var mediaFiles = allFiles.filter(function(f) { return f.startsWith("ppt/media/") && !f.endsWith("/"); });
    var layoutFiles = allFiles.filter(function(f) { return f.startsWith("ppt/slideLayouts/") && f.endsWith(".xml"); });
    var masterFiles = allFiles.filter(function(f) { return f.startsWith("ppt/slideMasters/") && f.endsWith(".xml"); });
    var themeFiles = allFiles.filter(function(f) { return f.startsWith("ppt/theme/") && f.endsWith(".xml"); });
    var relFiles = allFiles.filter(function(f) { return f.endsWith(".rels"); });

    report.slideCount = slideFiles.length;
    report.mediaCount = mediaFiles.length;

    logger.log("Slides: " + slideFiles.length);
    logger.log("Media: " + mediaFiles.length + " -> [" + mediaFiles.join(", ") + "]");
    logger.log("Layouts: " + layoutFiles.length + ", Masters: " + masterFiles.length + ", Themes: " + themeFiles.length);

    if (slideFiles.length === 0) {
      report.errors.push("No slides found in PPTX");
      return report;
    }

    // 2. Read presentation.xml for slide order
    var presEntry = zip.file("ppt/presentation.xml");
    if (presEntry) {
      var presText = await presEntry.async("text");
      var presDoc = parser.parse(presText);
      var sldIdLst = presDoc["p:presentation"] && presDoc["p:presentation"]["p:sldIdLst"];
      if (sldIdLst && sldIdLst["p:sldId"]) {
        var sldArr = Array.isArray(sldIdLst["p:sldId"]) ? sldIdLst["p:sldId"] : [sldIdLst["p:sldId"]];
        logger.log("Slide order: " + sldArr.length + " slide(s)");
        sldArr.forEach(function(s, i) {
          logger.log("  [" + i + "] id=" + (s["@_id"] || "?") + " rId=" + (s["@_r:id"] || "?"));
        });
      }
    }

    // 3. Extract first slide
    var targetSlideFile = slideFiles[0];
    logger.log("Extracting slide: " + targetSlideFile);

    var slideText = await zip.file(targetSlideFile).async("text");
    logger.log("Slide XML: " + slideText.length + " chars");

    // Count elements
    var spCount = (slideText.match(/<p:sp[\s>]/g) || []).length;
    var picCount = (slideText.match(/<p:pic[\s>]/g) || []).length;
    var textRunCount = (slideText.match(/<a:t[\s>]/g) || []).length;
    logger.log("Elements: shapes=" + spCount + " images=" + picCount + " textRuns=" + textRunCount);

    // 4. Read slide rels
    var slideRelPath = targetSlideFile.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
    var slideRelEntry = zip.file(slideRelPath);
    var relSummary = [];
    if (slideRelEntry) {
      var relText = await slideRelEntry.async("text");
      var relDoc = parser.parse(relText);
      var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
      if (rels) {
        if (!Array.isArray(rels)) rels = [rels];
        rels.forEach(function(r) {
          relSummary.push({ id: r["@_Id"], type: r["@_Type"], target: r["@_Target"] });
          logger.log("  Rel: " + r["@_Id"] + " -> " + r["@_Target"] + " (" + (r["@_Type"] || "").split("/").pop() + ")");
        });
      }
    }
    report.relationships = relSummary;

    // 5. Merge test: create minimal target and insert slide
    logger.log("=== MERGE TEST ===");
    var mergeResult = await runMergeTest(JSZip, parser, zip, targetSlideFile, slideText, logger);
    report.mergeTest = mergeResult;

    report.elapsedMs = Date.now() - startTime;
    logger.log("Validation complete in " + report.elapsedMs + "ms");

  } catch (err) {
    var msg = err.message || String(err);
    logger.log("VALIDATION_ERROR: " + msg);
    report.errors.push(msg);
  }

  return report;
}

async function runMergeTest(JSZip, parser, sourceZip, slideFilePath, slideXmlText, logger) {
  var result = {
    shapesPreserved: false,
    imagesPreserved: false,
    textPreserved: false,
    mediaPreserved: false,
    outputSlideSize: 0,
    errors: [],
  };

  try {
    // Create minimal target PPTX
    var targetZip = new JSZip();

    // [Content_Types].xml
    targetZip.file("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>\n' +
      '  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>\n' +
      '  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n' +
      '  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n' +
      '  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>\n' +
      '  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>\n' +
      '</Types>');

    // _rels/.rels
    targetZip.file("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n' +
      '</Relationships>');

    // Blank placeholder slide (slide1)
    var blankSlide = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
      '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
      '</p:sld>';
    targetZip.file("ppt/slides/slide1.xml", blankSlide);
    targetZip.file("ppt/slides/_rels/slide1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>');

    // Copy slide as slide2
    targetZip.file("ppt/slides/slide2.xml", slideXmlText);
    result.outputSlideSize = slideXmlText.length;
    logger.log("Copied slide XML: " + slideXmlText.length + " chars");

    // Copy slide rels
    var slideRelPath = slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
    var relEntry = sourceZip.file(slideRelPath);
    var targetRelPath = "ppt/slides/_rels/slide2.xml.rels";
    var mediaCopied = 0;
    var mediaMissing = 0;

    if (relEntry) {
      var relText = await relEntry.async("text");
      targetZip.file(targetRelPath, relText);
      logger.log("Copied slide rels: " + relText.length + " chars");

      // Copy referenced media
      var relDoc = parser.parse(relText);
      var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
      if (rels) {
        if (!Array.isArray(rels)) rels = [rels];
        for (var i = 0; i < rels.length; i++) {
          var r = rels[i];
          var rType = r["@_Type"] || "";
          var rTarget = r["@_Target"] || "";
          if (rType.indexOf("image") !== -1 || rType.indexOf("media") !== -1) {
            var mediaPath;
            if (rTarget.startsWith("../")) {
              mediaPath = "ppt/" + rTarget.replace(/^\.\.\//, "");
            } else if (rTarget.startsWith("/")) {
              mediaPath = rTarget.substring(1);
            } else {
              mediaPath = "ppt/slides/" + rTarget;
            }
            var mediaEntry = sourceZip.file(mediaPath);
            if (mediaEntry) {
              var mediaBuf = await mediaEntry.async("nodebuffer");
              targetZip.file(mediaPath, mediaBuf);
              mediaCopied++;
              logger.log("  Copied media: " + mediaPath + " (" + mediaBuf.length + " bytes)");
            } else {
              mediaMissing++;
              logger.log("  MISSING media: " + mediaPath);
            }
          }
        }
      }
    }
    logger.log("Media: " + mediaCopied + " copied, " + mediaMissing + " missing");

    // Copy layout + master + theme from source (minimal: just the ones referenced)
    // For validation, we copy the layout referenced by slide1
    var layoutRelPath = "ppt/slideLayouts/slideLayout1.xml";
    var layoutEntry = sourceZip.file(layoutRelPath);
    if (layoutEntry) {
      var layoutText = await layoutEntry.async("text");
      targetZip.file(layoutRelPath, layoutText);
      logger.log("Copied layout: " + layoutRelPath);
    }

    var masterRelPath = "ppt/slideMasters/slideMaster1.xml";
    var masterEntry = sourceZip.file(masterRelPath);
    if (masterEntry) {
      var masterText = await masterEntry.async("text");
      targetZip.file(masterRelPath, masterText);
      logger.log("Copied master: " + masterRelPath);
    }

    var themeRelPath = "ppt/theme/theme1.xml";
    var themeEntry = sourceZip.file(themeRelPath);
    if (themeEntry) {
      var themeText = await themeEntry.async("text");
      targetZip.file(themeRelPath, themeText);
      logger.log("Copied theme: " + themeRelPath);
    }

    // Copy layout + master rels
    var layoutRelEntry = sourceZip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels");
    if (layoutRelEntry) targetZip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", await layoutRelEntry.async("text"));
    var masterRelEntry = sourceZip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels");
    if (masterRelEntry) targetZip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", await masterRelEntry.async("text"));

    // Build presentation.xml
    targetZip.file("ppt/presentation.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
      '  <p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>\n' +
      '  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>\n' +
      '  <p:notesSz cx="6858000" cy="9144000"/>\n' +
      '  <p:defaultTextStyle/>\n' +
      '</p:presentation>');

    targetZip.file("ppt/_rels/presentation.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>\n' +
      '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>\n' +
      '  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>\n' +
      '  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>\n' +
      '</Relationships>');

    // Generate output buffer
    var outputBuffer = await targetZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    logger.log("Generated output PPTX: " + outputBuffer.length + " bytes (" + Math.round(outputBuffer.length / 1024) + " KB)");

    // 6. Fidelity check
    logger.log("=== FIDELITY CHECK ===");
    var outputZip = await JSZip.loadAsync(outputBuffer);
    var outputSlideText = await outputZip.file("ppt/slides/slide2.xml").async("text");

    var srcShapes = (slideXmlText.match(/<p:sp[\s>]/g) || []).length;
    var outShapes = (outputSlideText.match(/<p:sp[\s>]/g) || []).length;
    var srcImages = (slideXmlText.match(/<p:pic[\s>]/g) || []).length;
    var outImages = (outputSlideText.match(/<p:pic[\s>]/g) || []).length;
    var srcText = slideXmlText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    var outText = outputSlideText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    result.shapesPreserved = srcShapes === outShapes;
    result.imagesPreserved = srcImages === outImages;
    result.textPreserved = srcText === outText;
    result.mediaPreserved = mediaMissing === 0;

    logger.log("Shapes: source=" + srcShapes + " output=" + outShapes + " -> " + (result.shapesPreserved ? "PASS" : "FAIL"));
    logger.log("Images: source=" + srcImages + " output=" + outImages + " -> " + (result.imagesPreserved ? "PASS" : "FAIL"));
    logger.log("Text: " + (result.textPreserved ? "PASS" : "PARTIAL") + " (len: " + srcText.length + " -> " + outText.length + ")");
    logger.log("Media: " + (result.mediaPreserved ? "PASS" : "FAIL") + " (" + mediaMissing + " missing)");

    // Check dimensions
    var srcDim = slideXmlText.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    if (srcDim) {
      logger.log("Slide dimensions: " + srcDim[1] + " x " + srcDim[2] + " EMU");
    }

  } catch (err) {
    var msg = err.message || String(err);
    logger.log("MERGE_ERROR: " + msg);
    result.errors.push(msg);
  }

  return result;
}

// ── Main Handler ──────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // POST only — never accept tokens in URLs (browser history, logs, analytics leaks)
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed. Use POST." }));
  }

  // Read token from Authorization header (preferred, secure) or body (backward compat)
  var authHeader = req.headers.authorization || "";
  var accessToken = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    accessToken = authHeader.substring(7).trim();
  }
  if (!accessToken && req.body && req.body.accessToken) {
    accessToken = req.body.accessToken;
  }
  if (!accessToken) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Missing Authorization: Bearer <token> header" }));
  }

  if (!CANONICAL_COMPONENTS_FOLDER_ID) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "CANONICAL_COMPONENTS_FOLDER_ID not configured" }));
  }

  var logger = createLogger();
  var reports = [];
  var allFolderFiles = [];
  var pptxFiles = [];
  var startTime = Date.now();

  try {
    // 1. Scan canonical folder (two-phase: broad + filtered)
    logger.log("=== CANONICAL FOLDER SCAN ===");
    var scanResult = await scanCanonicalFolder(CANONICAL_COMPONENTS_FOLDER_ID, accessToken, logger);
    allFolderFiles = scanResult.allFiles || [];
    pptxFiles = scanResult.pptxFiles || [];

    if (pptxFiles.length === 0) {
      logger.log("WARNING: No PPTX files found after filtering");
      logger.log("Check ALL_FILES_IN_FOLDER above — files may have unexpected mimeType");
    }

    // 2. Find target files
    logger.log("=== TARGET FILE MATCHING ===");
    var targets = [];
    TARGET_FILES.forEach(function(baseName) {
      var match = pptxFiles.find(function(f) { return f.baseName === baseName; });
      if (match) {
        targets.push(match);
        logger.log("MATCHED: " + baseName + " -> " + match.name + " (" + match.id.substring(0, 12) + "...)");
      } else {
        logger.log("MISSING: " + baseName + " not found in folder");
      }
    });

    // 3. Validate each target
    for (var i = 0; i < targets.length; i++) {
      var file = targets[i];
      logger.log("\n=== VALIDATING: " + file.name + " ===");

      var buffer = await downloadFile(file.id, accessToken, logger);
      var report = await validatePptxMerge(buffer, file.name, logger);
      reports.push(report);
    }

    // 4. Summary
    var hasResults = reports.length > 0;
    var allPassed = hasResults && reports.every(function(r) {
      return r.mergeTest && r.mergeTest.shapesPreserved && r.mergeTest.imagesPreserved && r.mergeTest.textPreserved && r.mergeTest.mediaPreserved && r.errors.length === 0;
    });

    logger.log("\n=== SUMMARY ===");
    logger.log("Files tested: " + reports.length + "/" + TARGET_FILES.length);
    logger.log("All passed: " + allPassed);
    reports.forEach(function(r) {
      var mt = r.mergeTest || {};
      var status = mt.shapesPreserved && mt.imagesPreserved && mt.textPreserved && mt.mediaPreserved ? "PASS" : "FAIL";
      logger.log("  " + r.fileName + ": " + status + " slides=" + r.slideCount + " media=" + r.mediaCount);
    });

    res.statusCode = hasResults ? (allPassed ? 200 : 207) : 200;
    res.end(JSON.stringify({
      ok: hasResults && allPassed,
      totalElapsedMs: Date.now() - startTime,
      folderId: CANONICAL_COMPONENTS_FOLDER_ID.substring(0, 12) + "...",
      allFolderFiles: allFolderFiles.map(function(f) { return { name: f.name, id: f.id, mimeType: f.mimeType }; }),
      pptxFilesFound: pptxFiles.length,
      targetsMatched: targets.length,
      targetsRequested: TARGET_FILES.length,
      reports: reports,
      logs: logger.getLogs(),
    }));

  } catch (err) {
    console.error("[validate-pptx-merge] Fatal:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: err.message || String(err),
      logs: logger.getLogs(),
    }));
  }
}
