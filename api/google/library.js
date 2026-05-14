// api/google/library.js — Library scanner with workspace root resolution

import {
  classifyDeck,
  classifySlide,
  extractRecurringPhrases,
  DECK_ARCHETYPES,
} from "./archetypes.js";

import {
  extractSlideDNA,
  buildDNAIndex,
} from "./dna.js";

import {
  buildSlideIndex,
  saveIndexToDrive,
} from "./retrieval.js";

import {
  resolveWorkspaceRoot,
  gapi,
  discoverFilesInFolder,
} from "./workspace.js";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && !req.query.accessToken) {
    return res.end(JSON.stringify({
      ok: true,
      hasDriveFolder: !!getRawDriveRoot(),
      rawDriveRoot: getRawDriveRoot() ? getRawDriveRoot().substring(0, 20) + "..." : "",
      msg: "Provide ?accessToken= to scan",
      availableArchetypes: Object.keys(DECK_ARCHETYPES),
    }));
  }

  var token = req.query.accessToken || ((req.body || {}).accessToken);
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  var logs = [];
  var workspaceMeta = null;

  // ── PHASE 0: Resolve workspace root ──
  resolveWorkspaceRoot(token, logs).then(function(resolved) {
    logs.push("RESOLVED: rootName='" + resolved.rootName + "' rootId=" + resolved.rootId.substring(0, 16) + "...");
    logs.push("RESOLVED: autoCorrected=" + resolved.isAutoCorrected);
    if (resolved.correctionReason) {
      logs.push("RESOLVED: reason=" + resolved.correctionReason);
    }
    if (resolved.isAutoCorrected) {
      logs.push("RESOLVED: raw was '" + resolved.rawRootName + "' (" + resolved.rawRootId.substring(0, 12) + "...)");
    }

    workspaceMeta = resolved;
    var DRIVE_ROOT = resolved.rootId;

    // Guard: if no valid root, return error
    if (!DRIVE_ROOT) {
      return res.end(JSON.stringify({
        ok: false,
        error: resolved.correctionReason || "Cannot resolve workspace root",
        workspace: {
          rootFolderName: resolved.rootName || "?",
          rootFolderId: resolved.rootId || "",
          isAutoCorrected: resolved.isAutoCorrected,
          correctionReason: resolved.correctionReason,
        },
        logs: logs,
      }));
    }

    // ── PHASE 1: List all children under resolved root ──
    return listChildrenRobust(token, DRIVE_ROOT, logs).then(function(allChildren) {
      logs.push("TOTAL children: " + allChildren.length);

      var folders = {};
      var folderNames = [];
      allChildren.forEach(function(f) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          folderNames.push(f.name);
          if (!folders[f.name]) {
            folders[f.name] = f.id;
          }
        }
      });

      logs.push("FOLDER NAMES found: [" + folderNames.join(", ") + "]");

      var sourceId = folders["02 Source Decks"] || null;
      var tmplId = folders["03 Templates"] || null;

      logs.push("MATCH: 02 Source Decks=" + (sourceId ? "YES(" + sourceId.substring(0, 12) + "...)" : "NO"));
      logs.push("MATCH: 03 Templates=" + (tmplId ? "YES(" + tmplId.substring(0, 12) + "...)" : "NO"));

      // ── If no source/template folders, return early with diagnostics ──
      if (!sourceId && !tmplId) {
        return res.end(JSON.stringify({
          ok: true,
          msg: "No source/template folders found",
          workspace: {
            rootFolderName: workspaceMeta.rootName,
            rootFolderId: workspaceMeta.rootId,
            isAutoCorrected: workspaceMeta.isAutoCorrected,
            correctionReason: workspaceMeta.correctionReason,
            rawRootName: workspaceMeta.rawRootName,
            rawRootId: workspaceMeta.rawRootId,
          },
          patterns: null,
          fileList: [],
          availableFolders: folderNames,
          allChildrenCount: allChildren.length,
          logs: logs,
        }));
      }

      // ── PHASE 2: Discover ALL files (broad query, then classify) ──
      var discoveryPromises = [];
      if (sourceId) discoveryPromises.push(discoverFilesInFolder(token, sourceId, "02 Source Decks", logs));
      if (tmplId) discoveryPromises.push(discoverFilesInFolder(token, tmplId, "03 Templates", logs));

      return Promise.all(discoveryPromises).then(function(discoveryResults) {
        var allFiles = [];
        var folderResults = [];
        discoveryResults.forEach(function(discovered) {
          // Collect all presentation-class files
          var pptxFiles = discovered.items.filter(function(f) { return f.isPresentation; });
          var subfolderFiles = discovered.subfolderFiles || [];
          var combined = pptxFiles.concat(subfolderFiles);
          logs.push(discovered.folder + ": " + combined.length + " presentation file(s) (" + pptxFiles.length + " direct + " + subfolderFiles.length + " from subfolders)");
          folderResults.push({ folder: discovered.folder, folderId: discovered.folderId, files: combined.map(function(f) { return { id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime }; }) });
        });
        return { folderResults: folderResults, folderNames: folderNames, allChildrenCount: allChildren.length };
      });
    }).then(function(ctx) {
      if (!ctx || !ctx.folderResults) return; // Error response already sent

      var folderResults = ctx.folderResults;
      var folderNames = ctx.folderNames;
      var allChildrenCount = ctx.allChildrenCount;

      var allFiles = [];
      folderResults.forEach(function(r) {
        logs.push(r.folder + ": " + r.files.length + " presentation file(s)");
        r.files.forEach(function(f) { allFiles.push({ folder: r.folder, id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime }); });
      });

      logs.push("DISCOVERED_FILES_COUNT: " + allFiles.length);
      allFiles.forEach(function(f, i) {
        logs.push("  FILE[" + i + "]: name='" + f.name + "' mimeType=" + (f.mimeType || "?") + " id=" + f.id.substring(0, 12) + "...");
      });

      if (allFiles.length === 0) {
        return res.end(JSON.stringify({
          ok: true, msg: "No presentation files found", totalPptxFiles: 0,
          workspace: { rootFolderName: workspaceMeta.rootName, rootFolderId: workspaceMeta.rootId },
          fileList: [], fileStatuses: [], deckProfiles: [], logs: logs,
        }));
      }

      var filesToScan = allFiles.slice(0, 5);
      logs.push("INDEXING_INPUT_COUNT: " + filesToScan.length + " of " + allFiles.length + " discovered files");

      // ── PHASE 3: Get or create 07 Template Library ──
      return findOldestFolder(token, DRIVE_ROOT, "07 Template Library", logs).then(function(tmplLibId) {
        if (tmplLibId) return tmplLibId;
        return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "07 Template Library", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
        }).then(function(r) { return r.json(); }).then(function(folder) {
          logs.push("Created 07 Template Library: " + folder.id);
          return folder.id;
        });
      }).then(function(templateLibId) {
        return deepScanFiles(token, filesToScan, templateLibId, logs);
      }).then(function(scanResult) {
        logs.push("SCAN_RESULT: deckProfiles=" + (scanResult.deckProfiles || []).length
          + " totalSlides=" + scanResult.totalSlidesScanned);

        // Build per-file status from scanResult
        var processingLog = scanResult.processingLog || [];
        function getFileStage(name) {
          var entries = processingLog.filter(function(e) { return e.fileName === name; });
          var lastFail = entries.slice().reverse().find(function(e) { return e.status === "FAIL"; });
          var lastOk = entries.slice().reverse().find(function(e) { return e.status === "OK"; });
          return {
            stage: lastFail ? lastFail.stage : (lastOk ? lastOk.stage : "DISCOVERED"),
            error: lastFail ? lastFail.detail : "",
            allStages: entries.map(function(e) { return e.stage + ":" + e.status; }),
          };
        }

        var fileStatuses = (scanResult.deckProfiles || []).map(function(dp) {
          var st = getFileStage(dp.fileName);
          return {
            name: dp.fileName,
            folder: dp.folder,
            presentationId: dp.presentationId,
            mimeType: dp.mimeType || "",
            status: "indexed",
            stage: st.stage,
            slideCount: dp.slideCount,
            dnaCount: (dp.slideDNA || []).length,
            archetype: dp.archetype,
            cloneable: true,
            error: "",
          };
        });
        var indexedNames = fileStatuses.map(function(s) { return s.name; });
        filesToScan.forEach(function(f) {
          if (indexedNames.indexOf(f.name) < 0) {
            var st = getFileStage(f.name);
            fileStatuses.push({ name: f.name, folder: f.folder, mimeType: f.mimeType || "", presentationId: "", status: "failed", stage: st.stage, slideCount: 0, dnaCount: 0, archetype: "", cloneable: false, error: st.error });
          }
        });

        if (!scanResult.deckProfiles || scanResult.deckProfiles.length === 0) {
          logs.push("INDEX: No deck profiles — all " + filesToScan.length + " files failed extraction");
          return res.end(JSON.stringify({
            ok: true, msg: "No slides extracted", totalPptxFiles: allFiles.length,
            workspace: { rootFolderName: workspaceMeta.rootName, rootFolderId: workspaceMeta.rootId },
            fileList: allFiles.map(function(f) { return { folder: f.folder, name: f.name, modifiedTime: f.modifiedTime }; }),
            fileStatuses: fileStatuses, deckProfiles: [], logs: logs,
          }));
        }

        logs.push("INDEX: Building from " + scanResult.deckProfiles.length + " deck profiles...");
        var slideIndex = buildSlideIndex(scanResult);
        logs.push("INDEX: text=" + slideIndex.slides.length + " slides from " + slideIndex.decks.length + " decks");

        var dnaIndex = buildDNAIndex(scanResult.deckProfiles);
        logs.push("INDEX: DNA=" + dnaIndex.slides.length + " slides components=" + JSON.stringify(dnaIndex.componentCounts));

        return saveIndexToDrive(token, DRIVE_ROOT, slideIndex, logs).then(function() {
          return saveDNAToDrive(token, DRIVE_ROOT, dnaIndex, logs);
        }).then(function() {
          logs.push("INDEX: Saved — slide_index.json + slide_dna.json");
          return res.end(JSON.stringify({
            ok: true,
            totalPptxFiles: allFiles.length,
            scannedFiles: filesToScan.length,
            workspace: {
              rootFolderName: workspaceMeta.rootName,
              rootFolderId: workspaceMeta.rootId,
              isAutoCorrected: workspaceMeta.isAutoCorrected,
              correctionReason: workspaceMeta.correctionReason,
              rawRootName: workspaceMeta.rawRootName,
              rawRootId: workspaceMeta.rawRootId,
            },
            fileList: allFiles.map(function(f) { return { folder: f.folder, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime }; }),
            fileStatuses: fileStatuses,
            processingLog: processingLog,
            ...scanResult,
            slideIndex: { slideCount: slideIndex.slides.length, deckCount: slideIndex.decks.length, builtAt: slideIndex.builtAt },
            dnaIndex: { slideCount: dnaIndex.slides.length, componentCounts: dnaIndex.componentCounts, builtAt: dnaIndex.builtAt },
            availableFolders: folderNames,
            allChildrenCount: allChildrenCount,
            logs: logs,
          }));
        });
      });
    });

  }).catch(function(err) {
    logs.push("CRITICAL: " + (err.message || String(err)));
    res.status(500).end(JSON.stringify({ ok: false, error: err.message || String(err), logs: logs }));
  });
}

// ── Child listing with multiple strategies ────────────────

function listChildrenRobust(token, rootId, logs) {
  logs.push("LIST: rootId=" + rootId.substring(0, 16) + "...");

  var query1 = encodeURIComponent("'" + rootId + "' in parents and trashed=false");
  var url1 = "https://www.googleapis.com/drive/v3/files?q=" + query1
    + "&fields=nextPageToken,files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true";

  return fetchPage(token, url1, logs, "s1(default)").then(function(result1) {
    logs.push("STRATEGY-1: " + result1.length + " items");
    if (result1.length > 1) return result1;

    logs.push("Trying alternates (s1 returned " + result1.length + ")...");

    var url2 = url1.replace("corpora=allDrives", "").replace(/&&/g, "&").replace(/&$/, "");
    return fetchPage(token, url2, logs, "s2(no-corpora)").then(function(result2) {
      logs.push("STRATEGY-2: " + result2.length + " items");
      if (result2.length > Math.max(result1.length, 1)) return result2;

      var query3 = encodeURIComponent("'" + rootId + "' in parents");
      var url3 = "https://www.googleapis.com/drive/v3/files?q=" + query3
        + "&fields=nextPageToken,files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime)"
        + "&pageSize=100"
        + "&supportsAllDrives=true"
        + "&includeItemsFromAllDrives=true";

      return fetchPage(token, url3, logs, "s3(no-trashed)").then(function(result3) {
        logs.push("STRATEGY-3: " + result3.length + " items");
        var best = result1;
        if (result2.length > best.length) best = result2;
        if (result3.length > best.length) best = result3;
        logs.push("USING best: " + best.length + " items");
        return best;
      });
    });
  });
}

function fetchPage(token, url, logs, label) {
  var allItems = [];
  function fetchOne(pageUrl) {
    logs.push("  API[" + label + "]: fetching...");
    return gapi(token, pageUrl).then(function(result) {
      if (!result.ok) {
        logs.push("  API[" + label + "] ERROR: status=" + result.status);
        return allItems;
      }
      var items = result.data.files || [];
      var nextToken = result.data.nextPageToken;
      logs.push("  API[" + label + "] page: " + items.length + " items" + (nextToken ? " (has more)" : ""));
      items.forEach(function(f) {
        logs.push("    CHILD: name='" + f.name + "' mimeType=" + f.mimeType);
      });
      allItems = allItems.concat(items);
      if (nextToken) {
        var nextUrl = pageUrl + (pageUrl.indexOf("?") >= 0 ? "&" : "?") + "pageToken=" + nextToken;
        return fetchOne(nextUrl);
      }
      return allItems;
    }).catch(function(err) {
      logs.push("  API[" + label + "] EXCEPTION: " + (err.message || String(err)));
      return allItems;
    });
  }
  return fetchOne(url);
}

// ── Duplicate-safe folder finder ──────────────────────────

function findOldestFolder(token, rootId, folderName, logs) {
  var query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.folder' and '" + rootId + "' in parents and name='" + folderName + "' and trashed=false"
  );
  var url = "https://www.googleapis.com/drive/v3/files?q=" + query
    + "&fields=files(id,name,createdTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true";

  return fetch(url, { headers: { Authorization: "Bearer " + token } })
    .then(function(r) { return r.json(); })
    .then(function(search) {
      var folders = (search.files || []).filter(function(f) { return f.name === folderName; });
      if (folders.length === 0) {
        logs.push("Folder '" + folderName + "' not found — will create");
        return null;
      }
      folders.sort(function(a, b) { return (a.createdTime || "").localeCompare(b.createdTime || ""); });
      var oldest = folders[0];
      logs.push("Folder '" + folderName + "': " + folders.length + " match(es), using oldest (" + oldest.id.substring(0, 12) + "...)");
      return oldest.id;
    })
    .catch(function(err) {
      logs.push("Folder '" + folderName + "' search error: " + (err.message || String(err)));
      return null;
    });
}


// ── Read & Extract Slides from a Presentation ─────────────

function readAndExtractSlides(token, presId, file, logs) {
  logs.push("  SLIDES_API: GET /v1/presentations/" + presId.substring(0, 12) + "... (full payload, no fields filter)");

  return gapi(token,
    "https://slides.googleapis.com/v1/presentations/" + presId
  ).then(function(pres) {
    if (!pres.ok) {
      logs.push("  Slides API FAILED: status=" + pres.status + " body=" + pres.body);
      return null;
    }

    var slides = pres.data.slides || [];
    var presTitle = pres.data.title || "(no title)";
    var slideCount = slides.length;
    logs.push("  SLIDES_API: status=" + pres.status + " title='" + presTitle + "' slides=" + slideCount);
    logs.push("  SLIDES_API: bodySize=" + pres.body.length + " bytes");

    if (slideCount > 0) {
      var firstSlide = slides[0];
      var firstElements = (firstSlide.pageElements || []).length;
      logs.push("  SLIDES_API: slide[0] id=" + firstSlide.objectId + " elements=" + firstElements);
    }

    var slideTexts = []; var slideTypes = []; var slideLayouts = [];
    var sectionFlow = []; var slideDetails = []; var slideDNARecords = [];
    var fileContentSamples = {};

    slides.forEach(function(slide) {
      var texts = []; var boldTexts = []; var shapeCount = 0;
      (slide.pageElements || []).forEach(function(el) {
        if (el.shape) {
          shapeCount++;
          if (el.shape.text && el.shape.text.textElements) {
            el.shape.text.textElements.forEach(function(te) {
              var txt = (te.textRun && te.textRun.content || "").trim();
              if (txt) {
                texts.push(txt);
                if (te.textRun && te.textRun.style && te.textRun.style.bold) boldTexts.push(txt);
              }
            });
          }
        }
      });
      var combinedText = texts.join(" ");
      slideTexts.push(combinedText);
      var classification = classifySlide(texts);
      slideTypes.push(classification.type);
      sectionFlow.push(classification.type);

      var layout = "text_only";
      if (shapeCount > 4) layout = "complex";
      else if (boldTexts.length > 0 && texts.length > 2) layout = "heading_body_bullets";
      else if (boldTexts.length > 0 && texts.length === 2) layout = "heading_body";
      else if (boldTexts.length > 0) layout = "title_only";
      slideLayouts.push(layout);

      var stKey = classification.type;
      if (!fileContentSamples[stKey]) fileContentSamples[stKey] = [];
      if (texts.length > 0) {
        var sample = texts.slice(0, 3).join(" | ").substring(0, 150);
        if (sample.length > 10) fileContentSamples[stKey].push(sample);
      }

      slideDetails.push({
        slideId: slide.objectId, slideType: classification.type,
        sectionTag: classification.type, text: combinedText,
        layout: layout, confidence: classification.confidence || 0.5,
      });
    });

    var deckClassification = classifyDeck(slideTexts, file.name);
    var archetypeKey = deckClassification.archetype;

    slides.forEach(function(slide, i) {
      var dna = extractSlideDNA(slide, slideTypes[i], archetypeKey, file.name, file.modifiedTime, presId);
      if (dna) slideDNARecords.push(dna);
    });

    var profile = {
      fileName: file.name, folder: file.folder, presentationId: presId,
      modifiedTime: file.modifiedTime, slideCount: slides.length,
      archetype: archetypeKey,
      archetypeLabel: DECK_ARCHETYPES[archetypeKey] ? DECK_ARCHETYPES[archetypeKey].label : archetypeKey,
      archetypeConfidence: deckClassification.confidence,
      sectionFlow: sectionFlow, slides: slideDetails, slideDNA: slideDNARecords,
      contentSamples: fileContentSamples,
    };

    logs.push("EXTRACT: " + file.name + " | archetype=" + archetypeKey + " | slides=" + slides.length + " | DNA=" + slideDNARecords.length + " | presId=" + presId.substring(0, 12) + "...");
    return profile;
  });
}

// ── Deep File Scan ────────────────────────────────────────

function deepScanFiles(token, files, templateLibId, logs) {
  logs.push("DEEPSCAN: starting with " + files.length + " files");
  files.forEach(function(f, i) {
    logs.push("DEEPSCAN: input[" + i + "] name='" + f.name + "' mimeType=" + (f.mimeType || "?") + " folder=" + f.folder);
  });

  var deckProfiles = [];
  var allSlideTexts = [];
  var allSlideTypes = [];
  var allSlideLayouts = [];
  var contentSamples = {};
  var processingLog = [];

  function logFileEvent(fileName, stage, status, detail) {
    var entry = {
      fileName: fileName,
      stage: stage,
      status: status,
      detail: detail || "",
      timestamp: new Date().toISOString(),
    };
    processingLog.push(entry);
    logs.push("[" + fileName + "] " + stage + ": " + status + (detail ? " — " + detail : ""));
  }

  function scanFile(index) {
    if (index >= files.length) {
      logs.push("DEEPSCAN: complete — deckProfiles=" + deckProfiles.length + " totalSlides=" + allSlideTypes.length);
      var topPhrases = extractRecurringPhrases(allSlideTexts, 2);
      var archetypeBreakdown = {};
      deckProfiles.forEach(function(d) { if (d.archetype) archetypeBreakdown[d.archetype] = (archetypeBreakdown[d.archetype] || 0) + 1; });
      var slideTypeCounts = {};
      allSlideTypes.forEach(function(st) { slideTypeCounts[st] = (slideTypeCounts[st] || 0) + 1; });
      var layoutCounts = {};
      allSlideLayouts.forEach(function(l) { layoutCounts[l] = (layoutCounts[l] || 0) + 1; });
      return Promise.resolve({
        deckProfiles: deckProfiles, archetypeBreakdown: archetypeBreakdown,
        slideTypeCounts: slideTypeCounts, layoutPreferences: layoutCounts,
        topPhrases: topPhrases.slice(0, 20), contentSamples: contentSamples,
        totalSlidesScanned: allSlideTypes.length, processingLog: processingLog,
      });
    }

    var file = files[index];
    logFileEvent(file.name, "DISCOVERED", "OK", "mimeType=" + (file.mimeType || "?") + " id=" + file.id.substring(0, 12) + "...");

    // ── STAGE: ACCESS_VERIFIED ──
    logFileEvent(file.name, "ACCESS_VERIFIED", "START", "checking file access");

    var isNativeSlides = file.mimeType === "application/vnd.google-apps.presentation";
    var isPptx = file.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
                 (file.name && file.name.toLowerCase().endsWith(".pptx"));

    logFileEvent(file.name, "ACCESS_VERIFIED", "OK", "native=" + isNativeSlides + " pptx=" + isPptx);

    if (isNativeSlides) {
      // ── NATIVE SLIDES PATH ──
      return processNativeSlides(token, file, logs, logFileEvent).then(function(profile) {
        if (profile) {
          deckProfiles.push(profile);
          profile.slides.forEach(function(s) { allSlideTypes.push(s.slideType); allSlideLayouts.push(s.layout); allSlideTexts.push(s.text); });
          Object.keys(profile.contentSamples || {}).forEach(function(k) {
            if (!contentSamples[k]) contentSamples[k] = [];
            contentSamples[k] = contentSamples[k].concat(profile.contentSamples[k]);
          });
          logFileEvent(file.name, "COMPLETE", "OK", profile.slideCount + " slides indexed");
        } else {
          logFileEvent(file.name, "COMPLETE", "FAIL", "profile is null");
        }
        return scanFile(index + 1);
      }).catch(function(err) {
        logFileEvent(file.name, "COMPLETE", "FAIL", "exception: " + (err.message || String(err)));
        return scanFile(index + 1);
      });
    }

    if (isPptx) {
      // ── PPTX IMPORT PATH ──
      return processPptxImport(token, file, templateLibId, logs, logFileEvent).then(function(profile) {
        if (profile) {
          deckProfiles.push(profile);
          profile.slides.forEach(function(s) { allSlideTypes.push(s.slideType); allSlideLayouts.push(s.layout); allSlideTexts.push(s.text); });
          Object.keys(profile.contentSamples || {}).forEach(function(k) {
            if (!contentSamples[k]) contentSamples[k] = [];
            contentSamples[k] = contentSamples[k].concat(profile.contentSamples[k]);
          });
          logFileEvent(file.name, "COMPLETE", "OK", profile.slideCount + " slides indexed");
        } else {
          logFileEvent(file.name, "COMPLETE", "FAIL", "profile is null");
        }
        return scanFile(index + 1);
      }).catch(function(err) {
        logFileEvent(file.name, "COMPLETE", "FAIL", "exception: " + (err.message || String(err)));
        return scanFile(index + 1);
      });
    }

    // Unknown type
    logFileEvent(file.name, "ACCESS_VERIFIED", "FAIL", "Unknown mimeType: " + (file.mimeType || "?"));
    return scanFile(index + 1);
  }

  return scanFile(0);
}

// ── Process Native Google Slides ──────────────────────────

function processNativeSlides(token, file, logs, logFileEvent) {
  logFileEvent(file.name, "IMPORT_STARTED", "SKIP", "Native Google Slides — no conversion needed");
  logFileEvent(file.name, "IMPORT_COMPLETE", "OK", "using fileId=" + file.id.substring(0, 12) + "...");

  return readAndExtractSlides(token, file.id, file, logs).then(function(profile) {
    if (profile) {
      logFileEvent(file.name, "SLIDES_EXTRACTED", "OK", profile.slideCount + " slides");
      logFileEvent(file.name, "DNA_EXTRACTED", "OK", (profile.slideDNA || []).length + " DNA records");
      logFileEvent(file.name, "INDEXED", "OK", profile.slides.length + " slide records");
    } else {
      logFileEvent(file.name, "SLIDES_EXTRACTED", "FAIL", "readAndExtractSlides returned null");
    }
    return profile;
  }).catch(function(err) {
    logFileEvent(file.name, "SLIDES_EXTRACTED", "FAIL", err.message || String(err));
    return null;
  });
}

// ── Process PPTX Import ───────────────────────────────────

function processPptxImport(token, file, templateLibId, logs, logFileEvent) {
  logFileEvent(file.name, "IMPORT_STARTED", "START", "Copying .pptx → Google Slides");

  var copyBody = JSON.stringify({ name: file.name, mimeType: "application/vnd.google-apps.presentation" });
  logFileEvent(file.name, "IMPORT_STARTED", "REQUEST", "POST /drive/v3/files/" + file.id + "/copy body=" + copyBody);

  return gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
    method: "POST",
    body: copyBody,
  }).then(function(copied) {
    if (!copied.ok) {
      var errDetail = copied.data.error ? (copied.data.error.message + " [code=" + copied.data.error.code + "]") : ("HTTP " + copied.status + ": " + copied.body);
      logFileEvent(file.name, "IMPORT_COMPLETE", "FAIL", errDetail);
      logFileEvent(file.name, "PRESENTATION_OPENED", "FAIL", "No presentationId — conversion failed");
      return null;
    }

    if (!copied.data.id) {
      logFileEvent(file.name, "IMPORT_COMPLETE", "FAIL", "Response OK but no id field. body=" + JSON.stringify(copied.data).substring(0, 200));
      return null;
    }

    var presId = copied.data.id;
    logFileEvent(file.name, "IMPORT_COMPLETE", "OK", "presentationId=" + presId);

    // Move to Template Library (never delete)
    var movePromise = Promise.resolve(presId);
    if (templateLibId) {
      movePromise = gapi(token, "https://www.googleapis.com/drive/v3/files/" + presId + "?addParents=" + templateLibId + "&supportsAllDrives=true", { method: "PATCH" })
        .then(function(m) {
          logFileEvent(file.name, "PERSIST", m.ok ? "OK" : "WARN", "status=" + m.status);
          return presId;
        })
        .catch(function(err) {
          logFileEvent(file.name, "PERSIST", "WARN", err.message || String(err));
          return presId;
        });
    }

    return movePromise.then(function() {
      logFileEvent(file.name, "PRESENTATION_OPENED", "OK", "opening " + presId.substring(0, 12) + "...");
      return readAndExtractSlides(token, presId, file, logs);
    }).then(function(profile) {
      if (profile) {
        logFileEvent(file.name, "SLIDES_EXTRACTED", "OK", profile.slideCount + " slides");
        logFileEvent(file.name, "DNA_EXTRACTED", "OK", (profile.slideDNA || []).length + " DNA records");
        logFileEvent(file.name, "INDEXED", "OK", profile.slides.length + " slide records");
      } else {
        logFileEvent(file.name, "SLIDES_EXTRACTED", "FAIL", "readAndExtractSlides returned null");
      }
      return profile;
    }).catch(function(err) {
      logFileEvent(file.name, "PRESENTATION_OPENED", "FAIL", "Slides API error: " + (err.message || String(err)));
      return null;
    });
  }).catch(function(err) {
    logFileEvent(file.name, "IMPORT_COMPLETE", "FAIL", "Copy exception: " + (err.message || String(err)));
    return null;
  });
}

// ── Save DNA Index ────────────────────────────────────────

function saveDNAToDrive(token, rootId, dnaIndex, logs) {
  return findOldestFolder(token, rootId, "06 Indexes", logs).then(function(folderId) {
    if (!folderId) {
      return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "06 Indexes", mimeType: "application/vnd.google-apps.folder", parents: [rootId] }),
      }).then(function(r) { return r.json(); }).then(function(folder) {
        folderId = folder.id;
        logs.push("Created 06 Indexes: " + folderId);
      });
    }
    return folderId;
  }).then(function(folderId) {
    var q = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='slide_dna.json' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search) {
      var existingId = search.files && search.files[0] ? search.files[0].id : null;
      var body = JSON.stringify(dnaIndex, null, 2);
      if (existingId) {
        return fetch("https://www.googleapis.com/upload/drive/v3/files/" + existingId + "?uploadType=media&supportsAllDrives=true", {
          method: "PATCH",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: body,
        }).then(function() { logs.push("Updated DNA index: " + existingId); return existingId; });
      } else {
        var metadata = { name: "slide_dna.json", mimeType: "application/json", parents: [folderId] };
        var form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", new Blob([body], { type: "application/json" }));
        return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
          method: "POST", headers: { Authorization: "Bearer " + token }, body: form,
        }).then(function(r) { return r.json(); }).then(function(file) {
          logs.push("Created DNA index: " + file.id); return file.id;
        });
      }
    });
  });
}
