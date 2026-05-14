const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

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

// ── HTTP Helper ───────────────────────────────────────────

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

// ── Robust Folder Listing ─────────────────────────────────

/**
 * List ALL children under DRIVE_ROOT with exhaustive logging.
 * Tries multiple query strategies if the first returns few results.
 * Handles pagination via nextPageToken.
 */
function listChildrenRobust(token, logs) {
  logs.push("LIST: DRIVE_ROOT=" + DRIVE_ROOT.substring(0, 20) + "...");

  // Strategy 1: Standard query with trashed=false, allDrives corpora
  var query1 = encodeURIComponent("'" + DRIVE_ROOT + "' in parents and trashed=false");
  var url1 = "https://www.googleapis.com/drive/v3/files?q=" + query1
    + "&fields=nextPageToken,files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true"
    + "&corpora=allDrives";

  return fetchPage(token, url1, logs, "strategy-1(trashed=false,allDrives)").then(function(result1) {
    logs.push("STRATEGY-1: " + result1.length + " item(s)");

    // If we got 0-1 items, try alternate strategies
    if (result1.length <= 1) {
      logs.push("WARNING: Strategy 1 returned " + result1.length + " items. Trying alternates...");

      // Strategy 2: Without corpora=allDrives (uses user's default corpus)
      var url2 = "https://www.googleapis.com/drive/v3/files?q=" + query1
        + "&fields=nextPageToken,files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime)"
        + "&pageSize=100"
        + "&supportsAllDrives=true"
        + "&includeItemsFromAllDrives=true";

      return fetchPage(token, url2, logs, "strategy-2(no-corpora)").then(function(result2) {
        logs.push("STRATEGY-2: " + result2.length + " item(s)");

        if (result2.length > result1.length) {
          logs.push("USING strategy-2 result (" + result2.length + " items)");
          return result2;
        }

        // Strategy 3: Without trashed filter at all
        var query3 = encodeURIComponent("'" + DRIVE_ROOT + "' in parents");
        var url3 = "https://www.googleapis.com/drive/v3/files?q=" + query3
          + "&fields=nextPageToken,files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime)"
          + "&pageSize=100"
          + "&supportsAllDrives=true"
          + "&includeItemsFromAllDrives=true";

        return fetchPage(token, url3, logs, "strategy-3(no-trashed-filter)").then(function(result3) {
          logs.push("STRATEGY-3: " + result3.length + " item(s)");

          if (result3.length > Math.max(result1.length, result2.length)) {
            logs.push("USING strategy-3 result (" + result3.length + " items)");
            return result3;
          }

          // Strategy 4: Get the DRIVE_ROOT folder itself to verify access
          return gapi(token, "https://www.googleapis.com/drive/v3/files/" + DRIVE_ROOT
            + "?fields=id,name,mimeType,ownedByMe,sharingUser(displayName),owners(displayName)"
            + "&supportsAllDrives=true")
            .then(function(rootInfo) {
              if (rootInfo.ok && rootInfo.data) {
                logs.push("DRIVE_ROOT folder: name='" + (rootInfo.data.name || "?") + "' mimeType=" + (rootInfo.data.mimeType || "?"));
                if (rootInfo.data.ownedByMe !== undefined) {
                  logs.push("DRIVE_ROOT ownedByMe=" + rootInfo.data.ownedByMe);
                }
                if (rootInfo.data.owners && rootInfo.data.owners[0]) {
                  logs.push("DRIVE_ROOT owner: " + rootInfo.data.owners[0].displayName);
                }
              } else {
                logs.push("WARNING: Cannot access DRIVE_ROOT folder. status=" + rootInfo.status + " body=" + rootInfo.body);
              }

              // Return the best result we have
              var best = result1.length >= result2.length ? result1 : result2;
              if (result3.length > best.length) best = result3;
              logs.push("USING best result: " + best.length + " items");
              return best;
            });
        });
      });
    }

    logs.push("USING strategy-1 result (" + result1.length + " items)");
    return result1;
  });
}

/**
 * Fetch all pages of a Drive files.list query.
 */
function fetchPage(token, url, logs, label) {
  var allItems = [];

  function fetchOne(pageUrl) {
    logs.push("  API[" + label + "]: " + pageUrl.substring(0, 160) + "...");
    return gapi(token, pageUrl).then(function(result) {
      if (!result.ok) {
        logs.push("  API[" + label + "] ERROR: status=" + result.status + " body=" + result.body);
        return allItems;
      }

      var items = result.data.files || [];
      var nextToken = result.data.nextPageToken;
      logs.push("  API[" + label + "] page: " + items.length + " items" + (nextToken ? " (more...)" : ""));

      items.forEach(function(f) {
        logs.push("    CHILD: name='" + f.name + "' mimeType=" + f.mimeType + " id=" + f.id.substring(0, 12) + "...");
      });

      allItems = allItems.concat(items);

      if (nextToken) {
        var nextUrl = pageUrl.replace(/pageToken=[^&]*/, "pageToken=" + nextToken);
        if (nextUrl === pageUrl) {
          nextUrl = pageUrl + (pageUrl.indexOf("?") >= 0 ? "&" : "?") + "pageToken=" + nextToken;
        }
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

// ── Duplicate-Safe Folder Finder ──────────────────────────

/**
 * Find ALL folders with a given name under DRIVE_ROOT.
 * Returns the oldest existing one (by createdTime).
 * Returns null if none exist.
 */
function findOldestFolder(token, folderName, logs) {
  var query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='" + folderName + "' and trashed=false"
  );
  var url = "https://www.googleapis.com/drive/v3/files?q=" + query
    + "&fields=files(id,name,createdTime)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true";

  return fetch(token, url, { headers: { Authorization: "Bearer " + token } })
    .then(function(r) { return r.json(); })
    .then(function(search) {
      var folders = (search.files || []).filter(function(f) {
        return f.name === folderName;
      });

      if (folders.length === 0) {
        logs.push("Folder '" + folderName + "' not found — will create");
        return null;
      }

      // Sort by createdTime ascending (oldest first)
      folders.sort(function(a, b) {
        return (a.createdTime || "").localeCompare(b.createdTime || "");
      });

      var oldest = folders[0];
      logs.push("Folder '" + folderName + "': " + folders.length + " match(es), using oldest (" + oldest.id.substring(0, 12) + "..., created " + oldest.createdTime + ")");

      return oldest.id;
    })
    .catch(function(err) {
      logs.push("Folder '" + folderName + "' search error: " + (err.message || String(err)));
      return null;
    });
}

// ── Main Handler ──────────────────────────────────────────

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
  logs.push("DRIVE_ROOT: " + DRIVE_ROOT.substring(0, 20) + "...");

  // ── PHASE 1: List all children under DRIVE_ROOT ──
  listChildrenRobust(token, logs).then(function(allChildren) {
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

    // ── If no folders found, try to diagnose ──
    if (!sourceId && !tmplId) {
      // Maybe the items exist but are not folders (e.g. shortcuts?)
      var nonFolderMatches = allChildren.filter(function(f) {
        return f.name === "02 Source Decks" || f.name === "03 Templates";
      });
      if (nonFolderMatches.length > 0) {
        nonFolderMatches.forEach(function(f) {
          logs.push("NON-FOLDER match: '" + f.name + "' mimeType=" + f.mimeType);
        });
      }

      return res.end(JSON.stringify({
        ok: true,
        msg: "No source/template folders found",
        patterns: null,
        fileList: [],
        availableFolders: folderNames,
        allChildrenCount: allChildren.length,
        logs: logs,
      }));
    }

    // ── PHASE 2: Find PPTX files in source/template folders ──
    var lists = [];
    if (sourceId) {
      var sq = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + sourceId + "' in parents and trashed=false");
      lists.push(
        gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + sq + "&fields=files(id,name,modifiedTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true")
          .then(function(r) {
            logs.push("02 Source Decks API: status=" + r.status + " files=" + (r.data.files || []).length);
            return { folder: "02 Source Decks", folderId: sourceId, files: r.data.files || [] };
          })
      );
    }
    if (tmplId) {
      var tq = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplId + "' in parents and trashed=false");
      lists.push(
        gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + tq + "&fields=files(id,name,modifiedTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true")
          .then(function(r) {
            logs.push("03 Templates API: status=" + r.status + " files=" + (r.data.files || []).length);
            return { folder: "03 Templates", folderId: tmplId, files: r.data.files || [] };
          })
      );
    }
    return Promise.all(lists);

  }).then(function(folderResults) {
    if (!Array.isArray(folderResults)) return; // Error response already sent

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

    // ── PHASE 3: Get or create 07 Template Library ONCE ──
    return findOldestFolder(token, "07 Template Library", logs).then(function(tmplLibId) {
      if (tmplLibId) return tmplLibId;

      // Create it
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
      // Build and persist text index
      logs.push("Building text index...");
      var slideIndex = buildSlideIndex(scanResult);
      logs.push("Text index: " + slideIndex.slides.length + " slides");

      // Build and persist DNA index
      logs.push("Building DNA index...");
      var dnaIndex = buildDNAIndex(scanResult.deckProfiles);
      logs.push("DNA index: " + dnaIndex.slides.length + " slides, components: " + JSON.stringify(dnaIndex.componentCounts));

      return saveIndexToDrive(token, slideIndex, logs).then(function() {
        return saveDNAToDrive(token, dnaIndex, logs);
      }).then(function() {
        return res.end(JSON.stringify({
          ok: true,
          totalPptxFiles: allFiles.length,
          scannedFiles: filesToScan.length,
          fileList: allFiles.map(function(f) { return { folder: f.folder, name: f.name, modifiedTime: f.modifiedTime }; }),
          ...scanResult,
          slideIndex: { slideCount: slideIndex.slides.length, deckCount: slideIndex.decks.length, builtAt: slideIndex.builtAt },
          dnaIndex: { slideCount: dnaIndex.slides.length, componentCounts: dnaIndex.componentCounts, builtAt: dnaIndex.builtAt },
          logs: logs,
        }));
      });
    });

  }).catch(function(err) {
    logs.push("CRITICAL: " + (err.message || String(err)));
    res.status(500).end(JSON.stringify({ ok: false, error: err.message || String(err), logs: logs }));
  });
}

// ── Deep File Scan ────────────────────────────────────────

function deepScanFiles(token, files, templateLibId, logs) {
  var deckProfiles = [];
  var allSlideTexts = [];
  var allSlideTypes = [];
  var allSlideLayouts = [];
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
    logs.push("SCAN: Copying " + file.name + " (id=" + file.id.substring(0, 12) + "...)");

    // Step 1: Copy PPTX to Google Slides format
    return gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
      method: "POST",
      body: JSON.stringify({ name: file.name, mimeType: "application/vnd.google-apps.presentation" }),
    }).then(function(copied) {
      if (!copied.ok || !copied.data.id) {
        logs.push("  Copy FAILED: status=" + copied.status + " body=" + copied.body);
        return scanFile(index + 1);
      }

      var tempId = copied.data.id;
      logs.push("  Copy OK: " + tempId.substring(0, 12) + "...");

      // Step 2: Move to 07 Template Library for persistence
      var movePromise = Promise.resolve(tempId);
      if (templateLibId) {
        movePromise = gapi(token,
          "https://www.googleapis.com/drive/v3/files/" + tempId
          + "?addParents=" + templateLibId
          + "&supportsAllDrives=true",
          { method: "PATCH" }
        ).then(function() {
          logs.push("  Moved to Template Library");
          return tempId;
        }).catch(function(err) {
          logs.push("  Move warning: " + (err.message || String(err)));
          return tempId;
        });
      }

      return movePromise.then(function(presId) {
        // Step 3: Fetch full slide data with element properties
        return gapi(token,
          "https://slides.googleapis.com/v1/presentations/" + presId
          + "?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId,predefinedLayout)),pageElements(objectId,transform(translateX,translateY,scaleX,scaleY,rotate),size(width(height,magnitude),height(height,magnitude)),shape(objectId,shapeType,shapeProperties(shapeBackgroundFill(solidFill(color(rgbColor)))),text(textElements(content,textRun(content,style(bold,fontSize,foregroundColor(opaqueColor(rgbColor))))))),image(contentUrl)))"
        ).then(function(pres) {
          if (!pres.ok) {
            logs.push("  Slides API FAILED: status=" + pres.status + " body=" + pres.body);
            return scanFile(index + 1);
          }

          var slides = pres.data.slides || [];
          logs.push("  " + file.name + ": " + slides.length + " slides");

          var slideTexts = [];
          var slideTypes = [];
          var slideLayouts = [];
          var sectionFlow = [];
          var slideDetails = [];
          var slideDNARecords = [];

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

            var classification = classifySlide(texts);
            slideTypes.push(classification.type);
            allSlideTypes.push(classification.type);
            sectionFlow.push(classification.type);

            var layout = "text_only";
            if (shapeCount > 4) layout = "complex";
            else if (boldTexts.length > 0 && texts.length > 2) layout = "heading_body_bullets";
            else if (boldTexts.length > 0 && texts.length === 2) layout = "heading_body";
            else if (boldTexts.length > 0) layout = "title_only";
            slideLayouts.push(layout);
            allSlideLayouts.push(layout);

            var stKey = classification.type;
            if (!contentSamples[stKey]) contentSamples[stKey] = [];
            if (texts.length > 0) {
              var sample = texts.slice(0, 3).join(" | ").substring(0, 150);
              if (sample.length > 10) contentSamples[stKey].push(sample);
            }

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

          // Extract DNA for each slide
          slides.forEach(function(slide, i) {
            var dna = extractSlideDNA(slide, slideTypes[i], archetypeKey, file.name, file.modifiedTime, presId);
            if (dna) slideDNARecords.push(dna);
          });

          var profile = {
            fileName: file.name,
            folder: file.folder,
            presentationId: presId,
            modifiedTime: file.modifiedTime,
            slideCount: slides.length,
            archetype: archetypeKey,
            archetypeLabel: DECK_ARCHETYPES[archetypeKey] ? DECK_ARCHETYPES[archetypeKey].label : archetypeKey,
            archetypeConfidence: deckClassification.confidence,
            sectionFlow: sectionFlow,
            slides: slideDetails,
            slideDNA: slideDNARecords,
          };

          deckProfiles.push(profile);
          allSlideTexts = allSlideTexts.concat(slideTexts);

          logs.push("  Profile: " + file.name + " | archetype=" + archetypeKey + " | slides=" + slides.length + " | DNA=" + slideDNARecords.length);

          // Slide copy is kept in 07 Template Library — do NOT delete
          return scanFile(index + 1);

        }).catch(function(err) {
          logs.push("  Error scanning " + file.name + ": " + (err.message || String(err)));
          return scanFile(index + 1);
        });
      });
    }).catch(function(err) {
      logs.push("  Error copying " + file.name + ": " + (err.message || String(err)));
      return scanFile(index + 1);
    });
  }

  return scanFile(0);
}

// ── Save DNA Index to Drive ───────────────────────────────

function saveDNAToDrive(token, dnaIndex, logs) {
  return getOrCreateIndexFolder(token, logs).then(function(folderId) {
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
        }).then(function() {
          logs.push("Updated DNA index: " + existingId);
          return existingId;
        });
      } else {
        var metadata = { name: "slide_dna.json", mimeType: "application/json", parents: [folderId] };
        var form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", new Blob([body], { type: "application/json" }));
        return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: form,
        }).then(function(r) { return r.json(); }).then(function(file) {
          logs.push("Created DNA index: " + file.id);
          return file.id;
        });
      }
    });
  });
}

// ── Index Folder ──────────────────────────────────────────

function getOrCreateIndexFolder(token, logs) {
  return findOldestFolder(token, "06 Indexes", logs).then(function(folderId) {
    if (folderId) return folderId;
    return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "06 Indexes", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
    }).then(function(r) { return r.json(); }).then(function(folder) {
      logs.push("Created 06 Indexes: " + folder.id);
      return folder.id;
    });
  });
}
