const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

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

function inferSectionOrder(orderCounts) {
  var entries = Object.entries(orderCounts).sort(function(a, b) { return b[1] - a[1]; });
  if (entries.length === 0) return ["cover", "overview", "approach", "case_study", "next_steps"];
  var bestFlow = entries[0][0].split(" > ");
  var hasCover = bestFlow.includes("cover");
  var hasNextSteps = bestFlow.includes("next_steps");
  var normalized = bestFlow.slice();
  if (!hasCover) normalized.unshift("cover");
  if (!hasNextSteps) normalized.push("next_steps");
  var seen = {};
  normalized = normalized.filter(function(s) { if (seen[s]) return false; seen[s] = true; return true; });
  return normalized;
}

function extractPatterns(token, files, logs) {
  var sectionOrderCounts = {};
  var sectionContentSamples = {};
  var layoutTypes = {};
  var commonPhrases = {};
  var fileSummaries = [];

  function processFile(fileIndex) {
    if (fileIndex >= files.length) {
      var inferredOrder = inferSectionOrder(sectionOrderCounts);
      var topPhrases = Object.entries(commonPhrases).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15).map(function(e) { return { phrase: e[0], count: e[1] }; });
      return Promise.resolve({
        inferredSectionOrder: inferredOrder,
        sectionContentSamples: Object.fromEntries(Object.entries(sectionContentSamples).map(function(e) { return [e[0], e[1].slice(0, 5)]; })),
        layoutPreferences: layoutTypes,
        topPhrases: topPhrases,
        fileSummaries: fileSummaries,
      });
    }

    var file = files[fileIndex];
    return gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
      method: "POST",
      body: JSON.stringify({ name: "[SCAN] " + file.name, mimeType: "application/vnd.google-apps.presentation" }),
    }).then(function(copied) {
      if (!copied.data.id) {
        logs.push("Skip (copy failed): " + file.name + " -> " + JSON.stringify(copied.data));
        return processFile(fileIndex + 1);
      }
      var tempId = copied.data.id;

      return gapi(token, "https://slides.googleapis.com/v1/presentations/" + tempId + "?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId)),pageElements(shape(text(textElements(content,textRun(content,style(bold,fontSize,foregroundColor))))),pageElements(shape(shapeType))))")
        .then(function(pres) {
          var slides = pres.data.slides || [];
          var fileSections = [];

          for (var idx = 0; idx < slides.length; idx++) {
            var slide = slides[idx];
            var texts = [];
            var boldTexts = [];

            for (var ei = 0; ei < (slide.pageElements || []).length; ei++) {
              var el = slide.pageElements[ei];
              if (el.shape) {
                if (el.shape.text && el.shape.text.textElements) {
                  for (var ti = 0; ti < el.shape.text.textElements.length; ti++) {
                    var te = el.shape.text.textElements[ti];
                    var txt = (te.textRun && te.textRun.content || "").trim();
                    if (txt) {
                      texts.push(txt);
                      if (te.textRun && te.textRun.style && te.textRun.style.bold) boldTexts.push(txt);
                    }
                  }
                }
              }
            }

            var fullText = texts.join(" ").toLowerCase();
            var cat = "content";
            var patterns = {
              cover: ["brinc", "proposal", "partnership", "collaboration", "opportunity"],
              overview: ["about brinc", "who we are", "overview", "about us", "company overview"],
              track_record: ["track record", "portfolio", "metrics", "numbers", "results", "achievements"],
              team: ["team", "leadership", "people", "experts"],
              case_study: ["case study", "case studies", "portfolio", "experience", "det", "hi2", "accelerator", "program"],
              approach: ["approach", "methodology", "process", "how we work", "our approach"],
              next_steps: ["next step", "action", "get started", "timeline", "roadmap", "moving forward"],
              objectives: ["objective", "goals", "scope", "aim", "purpose"],
              financial: ["budget", "revenue", "financial", "investment", "funding", "cost"],
              value_proposition: ["value", "why brinc", "differentiator", "advantage", "unique"],
              deliverables: ["deliverable", "output", "milestone", "phase", "module"],
            };
            for (var pk in patterns) {
              if (patterns[pk].some(function(k) { return fullText.includes(k); })) { cat = pk; break; }
            }

            var layout = "text";
            if (slide.pageElements && slide.pageElements.length > 3) layout = "complex";
            else if (boldTexts.length > 0 && texts.length > 1) layout = "heading_body";
            else if (boldTexts.length > 0) layout = "title_only";
            layoutTypes[layout] = (layoutTypes[layout] || 0) + 1;

            fileSections.push(cat);

            if (!sectionContentSamples[cat]) sectionContentSamples[cat] = [];
            if (texts.length > 1) {
              var sample = texts.slice(0, 3).join(" | ").substring(0, 120);
              if (sample.length > 10) sectionContentSamples[cat].push(sample);
            }

            var words = fullText.split(/\s+/).filter(function(w) { return w.length > 3; });
            for (var wi = 0; wi < words.length - 1; wi++) {
              var phrase = words[wi] + " " + words[wi + 1];
              if (!["this is", "that the", "with the", "for the", "from the"].includes(phrase)) {
                commonPhrases[phrase] = (commonPhrases[phrase] || 0) + 1;
              }
            }
          }

          var orderKey = fileSections.join(" > ");
          sectionOrderCounts[orderKey] = (sectionOrderCounts[orderKey] || 0) + 1;

          fileSummaries.push({
            fileName: file.name,
            folder: file.folder,
            slideCount: slides.length,
            sectionFlow: fileSections,
          });

          logs.push("Scanned: " + file.name + " (" + slides.length + " slides)");

          // Clean up temp
          fetch("https://www.googleapis.com/drive/v3/files/" + tempId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(function(){});

          return processFile(fileIndex + 1);
        }).catch(function(err) {
          fetch("https://www.googleapis.com/drive/v3/files/" + tempId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(function(){});
          logs.push("Error extracting " + file.name + ": " + (err.message || String(err)));
          return processFile(fileIndex + 1);
        });
    }).catch(function(err) {
      logs.push("Error copying " + file.name + ": " + (err.message || String(err)));
      return processFile(fileIndex + 1);
    });
  }

  return processFile(0);
}

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && !req.query.accessToken) {
    return res.end(JSON.stringify({ ok: true, hasDriveFolder: !!DRIVE_ROOT, msg: "Provide ?accessToken=... to scan" }));
  }

  var token = req.query.accessToken || ((req.body || {}).accessToken);
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  var logs = [];
  logs.push("DRIVE_ROOT: " + DRIVE_ROOT.substring(0, 10) + "...");

  // STEP 1: List ALL children of DRIVE_ROOT and find folders by name
  var listUrl = "https://www.googleapis.com/drive/v3/files?q="
    + encodeURIComponent("'" + DRIVE_ROOT + "' in parents and trashed=false")
    + "&fields=files(id,name,mimeType)"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true"
    + "&corpora=allDrives";

  gapi(token, listUrl).then(function(listResult) {
    var allChildren = listResult.data.files || [];
    logs.push("DRIVE_ROOT children: " + allChildren.length + " item(s)");

    // Filter to folders and match by name
    var folders = {};
    allChildren.forEach(function(f) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        logs.push("  Folder: '" + f.name + "' (id=" + f.id.substring(0, 10) + "...)");
        folders[f.name] = f.id;
      }
    });

    // Also try with normalized names
    var sourceId = folders["02 Source Decks"] || folders["02 Source Decks "] || folders["02_Source_Decks"] || null;
    var tmplId = folders["03 Templates"] || folders["03 Templates "] || folders["03_Templates"] || null;

    logs.push("Matched 02 Source Decks: " + (sourceId || "NOT FOUND"));
    logs.push("Matched 03 Templates: " + (tmplId || "NOT FOUND"));

    if (!sourceId && !tmplId) {
      // Return diagnostics so user can see what folders exist
      return res.end(JSON.stringify({
        ok: true,
        msg: "No source/template folders found",
        patterns: null,
        fileList: [],
        availableFolders: Object.keys(folders),
        logs: logs,
      }));
    }

    // STEP 2: List PPTX files inside found folders
    var lists = [];
    if (sourceId) {
      var sq = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + sourceId + "' in parents and trashed=false");
      lists.push(
        gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + sq + "&fields=files(id,name,modifiedTime)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
          .then(function(r) { return { folder: "02 Source Decks", folderId: sourceId, files: r.data.files || [] }; })
      );
    }
    if (tmplId) {
      var tq = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplId + "' in parents and trashed=false");
      lists.push(
        gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + tq + "&fields=files(id,name,modifiedTime)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
          .then(function(r) { return { folder: "03 Templates", folderId: tmplId, files: r.data.files || [] }; })
      );
    }
    return Promise.all(lists);
  }).then(function(folderResults) {
    // If folderResults is a Response (from early return above), skip
    if (!Array.isArray(folderResults)) return;

    var allFiles = [];
    folderResults.forEach(function(r) {
      logs.push(r.folder + ": " + r.files.length + " PPTX file(s)");
      r.files.forEach(function(f) { allFiles.push({ folder: r.folder, id: f.id, name: f.name }); });
    });

    if (allFiles.length === 0) {
      return res.end(JSON.stringify({
        ok: true,
        msg: "No PPTX files found in source/template folders",
        patterns: null,
        fileList: [],
        logs: logs,
      }));
    }

    var filesToScan = allFiles.slice(0, 5);
    logs.push("Scanning " + filesToScan.length + " file(s) for patterns...");

    return extractPatterns(token, filesToScan, logs).then(function(patterns) {
      return res.end(JSON.stringify({
        ok: true,
        totalPptxFiles: allFiles.length,
        scannedFiles: filesToScan.length,
        fileList: allFiles.map(function(f) { return { folder: f.folder, name: f.name }; }),
        patterns: patterns,
        logs: logs,
      }));
    });
  }).catch(function(err) {
    logs.push("CRITICAL ERROR: " + (err.message || String(err)));
    res.status(500).end(JSON.stringify({ ok: false, error: err.message || String(err), logs: logs }));
  });
}
