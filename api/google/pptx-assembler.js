// ═══════════════════════════════════════════════════════════
//  PPTX Assembler — Core engine for slide-level PPTX assembly
//  Assembles final PPTX from exact slides (canonical + retrieved + placeholders)
// ═══════════════════════════════════════════════════════════

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import {
  downloadPptx,
  readSlideXml,
  createTargetPptx,
  createPlaceholderSlideXml,
  generatePptxBuffer,
  updateContentTypes,
  ensureContentTypeDefaults,
  gapi,
} from "./pptx-slide-ops.js";
import { copySlideWithDependencies } from "./pptx-slide-copy.js";
import { resolveRelationshipTarget } from "./opc-resolver.js";
import { validatePptx } from "./pptx-validator.js";

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };
var parser = new XMLParser(XML_OPTS);

// ═══════════════════════════════════════════════════════════
//  Main Assembly Orchestrator
// ═══════════════════════════════════════════════════════════

export async function assemble(slideSources, token, logger) {
  // slideSources: [{ source: "canonical"|"retrieved"|"generated", fileId?, slideIndex?, module?, title?, subtitle? }, ...]
  logger.log("[ASM] Starting assembly of " + slideSources.length + " slide(s)");

  // 1. Download all unique source PPTX files
  var sourceZips = {}; // fileId -> { zip, name }
  var canonicalFolderFiles = null; // for canonical lookups

  for (var i = 0; i < slideSources.length; i++) {
    var src = slideSources[i];
    if (src.source === "canonical") {
      // Lazy-scan canonical folder on first canonical slide
      if (!canonicalFolderFiles) {
        canonicalFolderFiles = await scanCanonicalFolder(process.env.CANONICAL_COMPONENTS_FOLDER_ID, token, logger);
      }
      var match = canonicalFolderFiles.find(function(f) { return f.baseName === "canonical_" + (src.module || ""); });
      if (!match) {
        logger.log("[ASM] Canonical not found: canonical_" + (src.module || "") + " — using placeholder");
        src.source = "generated";
        src.title = "Missing: canonical_" + (src.module || "");
        src.subtitle = "Source file not found in canonical folder";
        continue;
      }
      src.resolvedFileId = match.id;
      src.resolvedName = match.name;
      if (!sourceZips[match.id]) {
        var buf = await downloadPptx(match.id, token, logger);
        var zip = await JSZip.loadAsync(buf);
        sourceZips[match.id] = { zip: zip, name: match.name };
        logger.log("[ASM] Cached canonical: " + match.name);
      }
    } else if (src.source === "retrieved" && src.fileId) {
      if (!sourceZips[src.fileId]) {
        var rbuf = await downloadPptx(src.fileId, token, logger);
        var rzip = await JSZip.loadAsync(rbuf);
        sourceZips[src.fileId] = { zip: rzip, name: src.fileId.substring(0, 12) };
        logger.log("[ASM] Cached retrieved: " + src.fileId.substring(0, 12));
      }
    }
  }

  // 2. Create target PPTX
  var targetZip = createTargetPptx();
  var slideCount = 0;
  var slideEntries = []; // { slideNum, sldId, rId }

  // 3. Process each slide source
  for (var si = 0; si < slideSources.length; si++) {
    var source = slideSources[si];
    slideCount++;
    var slideNum = slideCount; // 1-based
    var sldId = 255 + slideNum; // unique slide IDs
    var rId = "rId" + slideNum;

    if (source.source === "generated" || source.source === "placeholder") {
      // Placeholder slide
      var placeholderXml = createPlaceholderSlideXml(source.title, source.subtitle);
      targetZip.file("ppt/slides/slide" + slideNum + ".xml", placeholderXml);
      targetZip.file("ppt/slides/_rels/slide" + slideNum + ".xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>');
      logger.log("[ASM] Slide " + slideNum + ": PLACEHOLDER — " + (source.title || "Generated Slide"));

    } else if (source.source === "canonical" && source.resolvedFileId) {
      // Canonical slide — copy with ALL transitive dependencies
      try {
        var csource = sourceZips[source.resolvedFileId];
        var cresult = await copySlideWithDependencies(targetZip, csource.zip, "ppt/slides/slide1.xml", slideNum, logger);
        logger.log("[ASM] Slide " + slideNum + ": CANONICAL — " + source.resolvedName + " (" + cresult.copied + " parts, " + cresult.missing + " missing)");
        if (cresult.missing > 0) {
          logger.log("[ASM]   Missing parts: " + cresult.missingList.join(", "));
        }
      } catch (cerr) {
        logger.log("[ASM] Slide " + slideNum + ": canonical copy failed — " + (cerr.message || String(cerr)));
      }

    } else if (source.source === "retrieved" && source.fileId) {
      // Retrieved slide — copy with ALL transitive dependencies
      try {
        var rsource = sourceZips[source.fileId];
        // Determine slide file path from slideIndex
        var rslidePath = "ppt/slides/slide" + ((source.slideIndex || 0) + 1) + ".xml";
        var rresult = await copySlideWithDependencies(targetZip, rsource.zip, rslidePath, slideNum, logger);
        logger.log("[ASM] Slide " + slideNum + ": RETRIEVED — " + source.fileId.substring(0, 12) + "[" + (source.slideIndex || 0) + "] (" + rresult.copied + " parts, " + rresult.missing + " missing)");
      } catch (rerr) {
        logger.log("[ASM] Slide " + slideNum + ": retrieved copy failed — " + (rerr.message || String(rerr)));
      }
    }

    slideEntries.push({ slideNum: slideNum, sldId: sldId, rId: rId });
  }

  // 4. Forensic media audit — inspect what actually landed in target ZIP
  logger.log("[ASM] === FORENSIC MEDIA AUDIT ===");
  var auditResults = [];
  try {
    for (var ai = 0; ai < slideSources.length; ai++) {
      try {
        var src = slideSources[ai];
        if (src.source !== "canonical" || !src.resolvedFileId) continue;
        var sZipEntry = sourceZips[src.resolvedFileId];
        if (!sZipEntry || !sZipEntry.zip) {
          logger.log("[ASM] Audit skip: no source ZIP for " + src.resolvedFileId.substring(0, 12));
          continue;
        }
        var audit = await auditSlideMedia(sZipEntry.zip, targetZip, "ppt/slides/slide1.xml", ai + 1, logger);
        auditResults = auditResults.concat(audit);
      } catch (itemErr) {
        logger.log("[ASM] FORENSIC_ERROR: slide=" + (ai + 1) + " error=" + (itemErr && itemErr.message ? itemErr.message : String(itemErr)));
      }
    }
    var auditMissing = auditResults.filter(function(a) { return !a.exists; });
    logger.log("[ASM] Audit: " + auditResults.length + " image refs, " + auditMissing.length + " missing");
    if (auditMissing.length > 0) {
      auditMissing.forEach(function(a) {
        logger.log("[ASM]   MISSING: " + a.expected + " (slide " + a.slide + ", " + a.rId + ")");
        if (a.foundCandidates.length > 0) {
          logger.log("[ASM]     Candidates: " + a.foundCandidates.join(", "));
        }
      });
    }
  } catch (auditErr) {
    logger.log("[ASM] FORENSIC_FATAL: " + (auditErr && auditErr.message ? auditErr.message : String(auditErr)));
  }

  // 5. Build presentation.xml with all slides
  await buildPresentationXml(targetZip, slideEntries);

  // 6. Build presentation.xml.rels
  await buildPresentationRels(targetZip, slideEntries);

  // 7. Update content types for all slide overrides
  await updateContentTypes(targetZip, slideCount);

  // 8. Ensure content type defaults for all media extensions (PNG, JPG, etc.)
  await ensureContentTypeDefaults(targetZip, logger);

  // 9. Generate buffer
  logger.log("[ASM] Generating final PPTX with " + slideCount + " slide(s)");
  var buffer = await generatePptxBuffer(targetZip);
  logger.log("[ASM] Generated: " + buffer.length + " bytes (" + Math.round(buffer.length / 1024) + " KB)");

  // 9. Validate the output
  logger.log("[ASM] Running post-assembly validation...");
  var validationReport = await validatePptx(buffer, logger);

  return {
    ok: true,
    slideCount: slideCount,
    buffer: buffer,
    sizeBytes: buffer.length,
    validation: validationReport,
  };
}

// ═══════════════════════════════════════════════════════════
//  Build presentation.xml (slide order list)
// ═══════════════════════════════════════════════════════════

async function buildPresentationXml(zip, slideEntries) {
  var sldIdEntries = slideEntries.map(function(e) {
    return '<p:sldId id="' + e.sldId + '" r:id="' + e.rId + '"/>';
  }).join("\n    ");

  var presXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:sldIdLst>\n    ' + sldIdEntries + '\n  </p:sldIdLst>\n' +
    '  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>\n' +
    '  <p:notesSz cx="6858000" cy="9144000"/>\n' +
    '  <p:defaultTextStyle/>\n' +
    '</p:presentation>';

  zip.file("ppt/presentation.xml", presXml);
}

// ═══════════════════════════════════════════════════════════
//  Build presentation.xml.rels (slide relationships)
// ═══════════════════════════════════════════════════════════

async function buildPresentationRels(zip, slideEntries) {
  var slideRels = slideEntries.map(function(e) {
    return '<Relationship Id="' + e.rId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + e.slideNum + '.xml"/>';
  }).join("\n  ");

  var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  ' + slideRels + '\n' +
    '  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>\n' +
    '  <Relationship Id="rId101" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>\n' +
    '</Relationships>';

  zip.file("ppt/_rels/presentation.xml.rels", relsXml);
}

// ═══════════════════════════════════════════════════════════
//  Forensic Media Audit — inspect what actually landed in target ZIP
// ═══════════════════════════════════════════════════════════

async function auditSlideMedia(sourceZip, targetZip, slideFilePath, slideNum, logger) {
  var results = [];
  var slideUri = "/" + slideFilePath;
  var slideRelPath = slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");

  // Read slide rels
  var relEntry = sourceZip.file(slideRelPath);
  if (!relEntry) return results;

  var relText = await relEntry.async("text");
  var relDoc = parser.parse(relText);
  var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
  if (!rels) return results;
  if (!Array.isArray(rels)) rels = [rels];

  // Get all media entries in target ZIP for candidate matching
  var targetMediaFiles = Object.keys(targetZip.files).filter(function(f) {
    return f.startsWith("ppt/media/");
  });

  for (var i = 0; i < rels.length; i++) {
    try {
      var r = rels[i];
      var rId = r["@_Id"] || "";
      var rType = r["@_Type"] || "";
      var rTarget = r["@_Target"] || "";

      // Only audit image relationships (these are the render-critical ones)
      if (rType.indexOf("image") === -1) continue;

      // Resolve expected path using OPC
      var resolved = resolveRelationshipTarget(slideUri, rTarget);
      var expected = resolved ? resolved.entryName : null;

      // Check if expected path exists in target
      var exists = expected ? !!targetZip.file(expected) : false;

      // Find candidates: any media file in target with similar basename
      var basename = expected ? expected.split("/").pop() : "";
      var candidates = targetMediaFiles.filter(function(f) {
        return f.indexOf(basename) !== -1 || basename.indexOf(f.split("/").pop()) !== -1;
      });

      results.push({
        rId: rId,
        slide: "slide" + slideNum,
        relType: rType.split("/").pop(),
        target: rTarget,
        expected: expected,
        exists: exists,
        foundCandidates: candidates,
      });
    } catch (relErr) {
      logger.log("[ASM] FORENSIC_ERROR: slide=" + slideNum + " rId=" + (rels[i] && rels[i]["@_Id"] || "?") + " error=" + (relErr && relErr.message ? relErr.message : ""));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
//  Canonical Folder Scan (reuses pattern from validate endpoint)
// ═══════════════════════════════════════════════════════════

async function scanCanonicalFolder(folderId, token, logger) {
  logger.log("[ASM] Scanning canonical folder: " + folderId.substring(0, 12) + "...");

  var q = "'" + folderId + "' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' or mimeType='application/vnd.google-apps.presentation')";
  var url = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q)
    + "&fields=files(id,name,mimeType,size,modifiedTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true"
    + "&corpora=allDrives";

  var result = await gapi(token, url);
  if (!result.ok) {
    logger.log("[ASM] Scan failed: HTTP " + result.status);
    return [];
  }

  var files = (result.data.files || []).map(function(f) {
    return {
      id: f.id,
      name: f.name || "",
      mimeType: f.mimeType,
      baseName: (f.name || "").toLowerCase().replace(/\.pptx$/, "").replace(/\.ppt$/, "").trim(),
    };
  });
  logger.log("[ASM] Found " + files.length + " canonical file(s)");
  return files;
}
