const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

import {
  classifyDeck,
  classifySlide,
  extractRecurringPhrases,
  DECK_ARCHETYPES,
} from "./archetypes.js";

import {
  buildSlideIndex,
  saveIndexToDrive,
} from "./retrieval.js";

function gapi(token, url, init) {
  return fetch(url, Object.assign({}, init, {
    headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
  })).then(function(r) {
    return r.text().then(function(t) {
      var d = {};
      try { d = t ? JSON.parse(t) : {}; } catch(e) {}
      return { ok: r.ok, status: r.status, data: d, body: t ? t.substring(0, 500) : "" };
    });
  });
}

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && !req.query.accessToken) {
    return res.end(JSON.stringify({
      ok: true,
      hasDriveFolder: !!DRIVE_ROOT,
      msg: "Provide ?accessToken=... to scan",
      availableArchetypes: Object.keys(DECK_ARCHETYPES)
    }));
  }

  var token = req.query.accessToken || ((req.body || {}).accessToken);
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  var logs = [];
  var scanMode = req.query.mode || "full";

  logs.push("Scan mode: " + scanMode);
  logs.push("DRIVE_ROOT: " + DRIVE_ROOT.substring(0, 15) + "...");

  var listUrl = "https://www.googleapis.com/drive/v3/files?q="
    + encodeURIComponent("'" + DRIVE_ROOT + "' in parents and trashed=false")
    + "&fields=files(id,name,mimeType,modifiedTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true"
    + "&corpora=allDrives";

  gapi(token, listUrl).then(function(listResult) {
    var allChildren = listResult.data.files || [];
    logs.push("Found " + allChildren.length + " item(s) under DRIVE_ROOT");

    var folders = {};
    allChildren.forEach(function(f) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        logs.push("  Folder: '" + f.name + "' (id=" + f.id.substring(0, 12) + "...)");
        folders[f.name] = f.id;
      }
    });

    var sourceId = folders["02 Source Decks"] || null;
    var tmplId = folders["03 Templates"] || null;

    logs.push("Matched: 02 Source Decks=" + (sourceId ? "YES" : "NO") + ", 03 Templates=" + (tmplId ? "YES" : "NO"));

    if (!sourceId && !tmplId) {
      return res.end(JSON.stringify({
        ok: true,
        msg: "No source/template folders found",
        patterns: null,
        fileList: [],
        availableFolders: Object.keys(folders),
        logs: logs,
      }));
    }

    var lists = [];
    if (sourceId) {
      var sq = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + sourceId + "' in parents and trashed=false");
      lists.push(
        gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + sq + "&fields=files(id,name,modifiedTime)&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
          .then(function(r) { return { folder: "02 Source Decks", folderId: sourceId, files: r.data.files || [] }; })
      );
    }
    if (tmplId) {
      var tq = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplId + "' in parents and trashed=false");
      lists.push(
        gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + tq + "&fields=files(id,name,modifiedTime)&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
          .then(function(r) { return { folder: "03 Templates", folderId: tmplId, files: r.data.files || [] }; })
      );
    }
    return Promise.all(lists);

  }).then(function(folderResults) {
    if (!Array.isArray(folderResults)) return;

    var allFiles = [];
    folderResults.forEach(function(r) {
      logs.push(r.folder + ": " + r.files.length + " PPTX file(s)");
      r.files.forEach(function(f) { allFiles.push({ folder: r.folder, id: f.id, name: f.name, modifiedTime: f.modifiedTime }); });
    });

    if (allFiles.length === 0) {
      return res.end(JSON.stringify({
        ok: true, msg: "No PPTX files found", totalPptxFiles: 0,
        fileList: [], patterns: null, logs: logs,
      }));
    }

    var filesToScan = allFiles.slice(0, 5);
    logs.push("Deep scanning " + filesToScan.length + " file(s)...");

    return deepScanFiles(token, filesToScan, logs).then(function(scanResult) {
      // Build and persist slide index
      logs.push("Building slide index...");
      var slideIndex = buildSlideIndex(scanResult);
      logs.push("Index: " + slideIndex.slides.length + " slides indexed");

      return saveIndexToDrive(token, slideIndex, logs).then(function() {
        return res.end(JSON.stringify({
          ok: true,
          totalPptxFiles: allFiles.length,
          scannedFiles: filesToScan.length,
          fileList: allFiles.map(function(f) { return { folder: f.folder, name: f.name, modifiedTime: f.modifiedTime }; }),
          ...scanResult,
          slideIndex: {
            slideCount: slideIndex.slides.length,
            deckCount: slideIndex.decks.length,
            builtAt: slideIndex.builtAt,
          },
          logs: logs,
        }));
      });
    });

  }).catch(function(err) {
    logs.push("CRITICAL: " + (err.message || String(err)));
    res.status(500).end(JSON.stringify({ ok: false, error: err.message || String(err), logs: logs }));
  });
}

// ═══════════════════════════════════════════════════════════
//  DEEP FILE SCAN — Archetype + Slide Classification
// ═══════════════════════════════════════════════════════════

function deepScanFiles(token, files, logs) {
  var deckProfiles = [];
  var allSlideTexts = [];
  var allSlideTypes = [];
  var allSlideLayouts = [];
  var sectionFlowCounts = {};
  var contentSamples = {};
  var archetypeCounts = {};

  function scanFile(index) {
    if (index >= files.length) {
      var topPhrases = extractRecurringPhrases(allSlideTexts, 2);
      var archetypeBreakdown = {};
      deckProfiles.forEach(function(d) {
        if (d.archetype) archetypeBreakdown[d.archetype] = (archetypeBreakdown[d.archetype] || 0) + 1;
      });
      var slideTypeCounts = {};
      allSlideTypes.forEach(function(st) { slideTypeCounts[st] = (slideTypeCounts[st] || 0) + 1; });
      var layoutCounts = {};
      allSlideLayouts.forEach(function(l) { layoutCounts[l] = (layoutCounts[l] || 0) + 1; });

      return Promise.resolve({
        deckProfiles: deckProfiles,
        archetypeBreakdown: archetypeBreakdown,
        slideTypeCounts: slideTypeCounts,
        layoutPreferences: layoutCounts,
        topPhrases: topPhrases.slice(0, 20),
        contentSamples: contentSamples,
        totalSlidesScanned: allSlideTypes.length,
      });
    }

    var file = files[index];

    return gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
      method: "POST",
      body: JSON.stringify({ name: "[SCAN] " + file.name, mimeType: "application/vnd.google-apps.presentation" }),
    }).then(function(copied) {
      if (!copied.data.id) {
        logs.push("  Skip (copy failed): " + file.name);
        return scanFile(index + 1);
      }

      var tempId = copied.data.id;

      return gapi(token,
        "https://slides.googleapis.com/v1/presentations/" + tempId
        + "?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId,predefinedLayout)),pageElements(shape(shapeType),shape(text(textElements(content,textRun(content,style(bold,fontSize,foregroundColor))))))))"
      ).then(function(pres) {
        var slides = pres.data.slides || [];
        logs.push("  " + file.name + ": " + slides.length + " slides");

        var slideTexts = [];
        var slideTypes = [];
        var slideLayouts = [];
        var sectionFlow = [];
        var slideDetails = [];

        slides.forEach(function(slide, sIdx) {
          var texts = [];
          var boldTexts = [];
          var shapeCount = 0;

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

          // Classify slide type
          var classification = classifySlide(texts);
          slideTypes.push(classification.type);
          allSlideTypes.push(classification.type);
          sectionFlow.push(classification.type);

          // Determine layout
          var layout = "text_only";
          if (shapeCount > 4) layout = "complex";
          else if (boldTexts.length > 0 && texts.length > 2) layout = "heading_body_bullets";
          else if (boldTexts.length > 0 && texts.length === 2) layout = "heading_body";
          else if (boldTexts.length > 0) layout = "title_only";
          slideLayouts.push(layout);
          allSlideLayouts.push(layout);

          // Collect content samples per slide type
          var stKey = classification.type;
          if (!contentSamples[stKey]) contentSamples[stKey] = [];
          if (texts.length > 0) {
            var sample = texts.slice(0, 3).join(" | ").substring(0, 150);
            if (sample.length > 10) contentSamples[stKey].push(sample);
          }

          // Store slide detail for indexing
          slideDetails.push({
            slideId: slide.objectId,
            slideType: classification.type,
            sectionTag: classification.type,
            text: combinedText,
            layout: layout,
            confidence: classification.confidence || 0.5,
          });
        });

        // Classify deck archetype
        var deckClassification = classifyDeck(slideTexts, file.name);
        var archetypeKey = deckClassification.archetype;
        archetypeCounts[archetypeKey] = (archetypeCounts[archetypeKey] || 0) + 1;

        var flowKey = sectionFlow.join(" > ");
        sectionFlowCounts[flowKey] = (sectionFlowCounts[flowKey] || 0) + 1;

        var profile = {
          fileName: file.name,
          folder: file.folder,
          presentationId: tempId,
          modifiedTime: file.modifiedTime,
          slideCount: slides.length,
          archetype: archetypeKey,
          archetypeLabel: DECK_ARCHETYPES[archetypeKey] ? DECK_ARCHETYPES[archetypeKey].label : archetypeKey,
          archetypeConfidence: deckClassification.confidence,
          sectionFlow: sectionFlow,
          slides: slideDetails,
        };

        deckProfiles.push(profile);
        allSlideTexts = allSlideTexts.concat(slideTexts);

        // Clean up temp copy
        fetch("https://www.googleapis.com/drive/v3/files/" + tempId, {
          method: "DELETE", headers: { Authorization: "Bearer " + token }
        }).catch(function(){});

        return scanFile(index + 1);

      }).catch(function(err) {
        fetch("https://www.googleapis.com/drive/v3/files/" + tempId, {
          method: "DELETE", headers: { Authorization: "Bearer " + token }
        }).catch(function(){});
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
