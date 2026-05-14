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
  getWorkspaceHealth,
  getRawDriveRoot,
} from "./workspace.js";

function gapi(token, url, init) {
  return fetch(url, Object.assign({}, init, {
    headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
  })).then(function(r) {
    return r.text().then(function(t) {
      var d = {};
      try { d = t ? JSON.parse(t) : {}; } catch(e) {}
      return { ok: r.ok, status: r.status, data: d, body: t ? t.substring(0, 800) : "" };
    });
  });
}

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
        var fileStatuses = (scanResult.deckProfiles || []).map(function(dp) {
          return {
            name: dp.fileName,
            folder: dp.folder,
            presentationId: dp.presentationId,
            status: "indexed",
            slideCount: dp.slideCount,
            dnaCount: (dp.slideDNA || []).length,
            archetype: dp.archetype,
            cloneable: true,
          };
        });
        var indexedNames = fileStatuses.map(function(s) { return s.name; });
        filesToScan.forEach(function(f) {
          if (indexedNames.indexOf(f.name) < 0) {
            fileStatuses.push({ name: f.name, folder: f.folder, status: "failed", slideCount: 0, dnaCount: 0, cloneable: false });
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
            fileList: allFiles.map(function(f) { return { folder: f.folder, name: f.name, modifiedTime: f.modifiedTime }; }),
            fileStatuses: fileStatuses,
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

// ── File Discovery (broad query + classification) ─────────

function discoverFilesInFolder(token, folderId, folderName, logs) {
  logs.push("DISCOVER: Scanning '" + folderName + "' (" + folderId.substring(0, 12) + "...)");

  var allItems = [];
  var subfolders = [];
  var subfolderFiles = [];

  // Step 1: Broad query — NO mimeType filter
  var broadQ = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
  var broadUrl = "https://www.googleapis.com/drive/v3/files?q=" + broadQ
    + "&fields=nextPageToken,files(id,name,mimeType,parents,fileExtension,shortcutDetails(targetId,targetMimeType),createdTime,modifiedTime,webViewLink)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true";

  return gapi(token, broadUrl).then(function(result) {
    if (!result.ok) {
      logs.push("DISCOVER: Broad query ERROR status=" + result.status + " body=" + result.body);
      return { folder: folderName, folderId: folderId, items: [], subfolderFiles: [] };
    }

    var files = result.data.files || [];
    logs.push("DISCOVER: Broad query returned " + files.length + " item(s) in '" + folderName + "'");

    files.forEach(function(f) {
      logs.push("DISCOVER:   name='" + f.name + "' mimeType=" + f.mimeType
        + (f.fileExtension ? " ext=" + f.fileExtension : "")
        + (f.shortcutDetails ? " SHORTCUT→" + f.shortcutDetails.targetMimeType : ""));

      var isPresentation = false;
      var isSubfolder = false;
      var effectiveId = f.id;
      var effectiveMimeType = f.mimeType;

      // Classify
      if (f.mimeType === "application/vnd.google-apps.folder") {
        isSubfolder = true;
      } else if (f.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
        isPresentation = true; // .pptx upload
      } else if (f.mimeType === "application/vnd.google-apps.presentation") {
        isPresentation = true; // Google Slides
      } else if (f.mimeType === "application/vnd.google-apps.shortcut" && f.shortcutDetails) {
        // Shortcut — resolve target mimeType
        var targetMime = f.shortcutDetails.targetMimeType || "";
        if (targetMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
            targetMime === "application/vnd.google-apps.presentation") {
          isPresentation = true;
          effectiveId = f.shortcutDetails.targetId || f.id;
          effectiveMimeType = targetMime;
          logs.push("DISCOVER:     → resolved shortcut to presentation");
        }
      }

      // Also match by name extension
      if (!isPresentation && !isSubfolder && f.name && f.name.toLowerCase().endsWith(".pptx")) {
        isPresentation = true;
        logs.push("DISCOVER:     → matched by .pptx extension");
      }

      var item = {
        id: effectiveId,
        name: f.name,
        mimeType: effectiveMimeType,
        originalMimeType: f.mimeType,
        fileExtension: f.fileExtension,
        isPresentation: isPresentation,
        isSubfolder: isSubfolder,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
      };

      allItems.push(item);
      if (isSubfolder) subfolders.push({ id: f.id, name: f.name });
    });

    // Step 2: Recursively scan subfolders
    if (subfolders.length > 0) {
      logs.push("DISCOVER: Recursing into " + subfolders.length + " subfolder(s)");
      var subPromises = subfolders.map(function(sf) {
        return discoverFilesInFolder(token, sf.id, folderName + "/" + sf.name, logs).then(function(sub) {
          return sub.items.filter(function(f) { return f.isPresentation; });
        });
      });
      return Promise.all(subPromises).then(function(subResults) {
        subResults.forEach(function(files) {
          subfolderFiles = subfolderFiles.concat(files);
        });
        logs.push("DISCOVER: Subfolders added " + subfolderFiles.length + " presentation file(s)");
        return { folder: folderName, folderId: folderId, items: allItems, subfolderFiles: subfolderFiles };
      });
    }

    return { folder: folderName, folderId: folderId, items: allItems, subfolderFiles: [] };
  });
}

// ── Read & Extract Slides from a Presentation ─────────────

function readAndExtractSlides(token, presId, file, logs) {
  return gapi(token,
    "https://slides.googleapis.com/v1/presentations/" + presId
    + "?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId,predefinedLayout)),pageElements(objectId,transform(translateX,translateY,scaleX,scaleY,rotate),size(width(height,magnitude),height(height,magnitude)),shape(objectId,shapeType,shapeProperties(shapeBackgroundFill(solidFill(color(rgbColor)))),text(textElements(content,textRun(content,style(bold,fontSize,foregroundColor(opaqueColor(rgbColor))))))),image(contentUrl)))"
  ).then(function(pres) {
    if (!pres.ok) {
      logs.push("  Slides API FAILED: status=" + pres.status + " body=" + pres.body);
      return null;
    }

    var slides = pres.data.slides || [];
    logs.push("  " + file.name + ": " + slides.length + " slides");

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
  var archetypeCounts = {};

  function scanFile(index) {
    if (index >= files.length) {
      logs.push("DEEPSCAN: recursion complete — deckProfiles=" + deckProfiles.length + " totalSlides=" + allSlideTypes.length);
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
        totalSlidesScanned: allSlideTypes.length,
      });
    }

    var file = files[index];
    var isNativeSlides = file.mimeType === "application/vnd.google-apps.presentation";

    // For native Google Slides, read directly. For .pptx, copy to Google Slides first.
    if (isNativeSlides) {
      logs.push("SCAN: Reading native Google Slides: " + file.name + " (" + file.id.substring(0, 12) + "...)");
      return readAndExtractSlides(token, file.id, file, logs).then(function(profile) {
        if (profile) {
          deckProfiles.push(profile);
          profile.slides.forEach(function(s) { allSlideTypes.push(s.slideType); allSlideLayouts.push(s.layout); allSlideTexts.push(s.text); });
          Object.keys(profile.contentSamples || {}).forEach(function(k) {
            if (!contentSamples[k]) contentSamples[k] = [];
            contentSamples[k] = contentSamples[k].concat(profile.contentSamples[k]);
          });
          logs.push("  PIPELINE native: deckProfiles=" + deckProfiles.length + " totalSlides=" + allSlideTypes.length);
        } else {
          logs.push("  PIPELINE native: profile is null for " + file.name);
        }
        return scanFile(index + 1);
      }).catch(function(err) {
        logs.push("  Error reading " + file.name + ": " + (err.message || String(err)));
        return scanFile(index + 1);
      });
    }

    logs.push("SCAN: Copying .pptx to Google Slides: " + file.name);
    return gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
      method: "POST",
      body: JSON.stringify({ name: file.name, mimeType: "application/vnd.google-apps.presentation" }),
    }).then(function(copied) {
      if (!copied.ok || !copied.data.id) {
        logs.push("  Copy FAILED: status=" + copied.status);
        return scanFile(index + 1);
      }
      var presId = copied.data.id;
      logs.push("  Copy OK: " + presId.substring(0, 12) + "...");

      var movePromise = Promise.resolve(presId);
      if (templateLibId) {
        movePromise = gapi(token, "https://www.googleapis.com/drive/v3/files/" + presId + "?addParents=" + templateLibId + "&supportsAllDrives=true", { method: "PATCH" })
          .then(function() { logs.push("  Moved to Template Library"); return presId; })
          .catch(function() { return presId; });
      }

      return movePromise.then(function() {
        return readAndExtractSlides(token, presId, file, logs);
      }).then(function(profile) {
        if (profile) {
          deckProfiles.push(profile);
          profile.slides.forEach(function(s) { allSlideTypes.push(s.slideType); allSlideLayouts.push(s.layout); allSlideTexts.push(s.text); });
          Object.keys(profile.contentSamples || {}).forEach(function(k) {
            if (!contentSamples[k]) contentSamples[k] = [];
            contentSamples[k] = contentSamples[k].concat(profile.contentSamples[k]);
          });
          logs.push("  PIPELINE: deckProfiles=" + deckProfiles.length + " totalSlides=" + allSlideTypes.length);
        } else {
          logs.push("  PIPELINE: profile is null — extraction failed for " + file.name);
        }
        return scanFile(index + 1);
      }).catch(function(err) {
        logs.push("  Error scanning " + file.name + ": " + (err.message || String(err)));
        return scanFile(index + 1);
      });
    }).catch(function(err) {
      logs.push("  Error copying " + file.name + ": " + (err.message || String(err)));
      return scanFile(index + 1);
    });
  }

  return scanFile(0);
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
