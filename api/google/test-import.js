// api/google/test-import.js — Minimal PPTX → Google Slides conversion test
// Uses the EXACT SAME discovery logic as library.js (shared from workspace.js)

import { resolveWorkspaceRoot, gapi, discoverFilesInFolder } from "./workspace.js";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  var token = req.query.accessToken || ((req.body || {}).accessToken);
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  var fileId = req.query.fileId || ((req.body || {}).fileId);
  var fileName = req.query.fileName || ((req.body || {}).fileName);
  var fileMimeType = req.query.mimeType || ((req.body || {}).mimeType);

  var logs = [];
  var stages = [];

  function logStage(stage, status, detail) {
    var entry = { stage: stage, status: status, timestamp: new Date().toISOString(), detail: detail || "" };
    stages.push(entry);
    logs.push(stage + ": " + status + (detail ? " — " + detail : ""));
  }

  logStage("INIT", "START", "fileId=" + (fileId || "auto-find") + " mimeType=" + (fileMimeType || "?"));

  // ── STAGE 1: Resolve workspace ──
  resolveWorkspaceRoot(token, logs).then(function(resolved) {
    var DRIVE_ROOT = resolved.rootId;
    logStage("WORKSPACE", resolved.rootId ? "OK" : "FAIL", "root=" + (resolved.rootName || "?") + " id=" + (resolved.rootId || "none"));

    if (!DRIVE_ROOT) {
      return res.end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "Cannot resolve workspace" }));
    }

    // ── STAGE 2: Find 02 Source Decks ──
    if (fileId) {
      // fileId provided — skip discovery, use it directly
      logStage("INPUT", "OK", "fileId=" + fileId.substring(0, 12) + "... name='" + (fileName || "?") + "' mimeType=" + (fileMimeType || "?"));
      return runConversion(token, DRIVE_ROOT, fileId, fileName || "test", fileMimeType || "application/vnd.openxmlformats-officedocument.presentationml.presentation", logs, stages, logStage, res);
    }

    // No fileId — use shared discoverFilesInFolder (EXACT same as library.js)
    logStage("DISCOVERY", "START", "Using shared discoverFilesInFolder for 02 Source Decks");

    // First find the folder ID for 02 Source Decks
    var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='02 Source Decks' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search) {
      var folderId = search.files && search.files[0] && search.files[0].id;
      if (!folderId) {
        logStage("FIND_FOLDER", "FAIL", "02 Source Decks not found");
        return res.end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "02 Source Decks not found" }));
      }
      logStage("FIND_FOLDER", "OK", "02 Source Decks=" + folderId.substring(0, 12) + "...");

      // Use the SAME function library.js uses
      return discoverFilesInFolder(token, folderId, "02 Source Decks", logs).then(function(discovered) {
        logStage("DISCOVERY", "COMPLETE", discovered.items.length + " total items, " + discovered.subfolderFiles.length + " from subfolders");

        // Get presentation-class files (same logic as library.js)
        var pptxFiles = discovered.items.filter(function(f) { return f.isPresentation; });
        var allPresentations = pptxFiles.concat(discovered.subfolderFiles || []);

        logStage("CLASSIFY", "OK", allPresentations.length + " presentation file(s)");

        // Log every discovered item (the user's requirement)
        var allItemsLog = discovered.items.map(function(f) {
          return { name: f.name, id: f.id, mimeType: f.mimeType, fileExtension: f.fileExtension, isPresentation: f.isPresentation };
        });

        if (allPresentations.length === 0) {
          logStage("SELECT_FILE", "FAIL", "No presentation files found");
          return res.end(JSON.stringify({
            ok: false, stages: stages, logs: logs,
            error: "No presentation files in 02 Source Decks",
            discoveredItems: allItemsLog,
            discoveredCount: discovered.items.length,
          }));
        }

        // Pick first presentation file
        var target = allPresentations[0];
        logStage("SELECT_FILE", "OK", "name='" + target.name + "' mimeType=" + target.mimeType + " id=" + target.id.substring(0, 12) + "...");

        return runConversion(token, DRIVE_ROOT, target.id, target.name, target.mimeType, logs, stages, logStage, res, allItemsLog);
      });
    });

  }).catch(function(err) {
    logStage("CRITICAL", "FAIL", err.message || String(err));
    res.status(500).end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: err.message || String(err) }));
  });
}

// ── Core Conversion Logic ─────────────────────────────────

function runConversion(token, DRIVE_ROOT, fileId, fileName, mimeType, logs, stages, logStage, res, discoveredItems) {
  var isNativeSlides = mimeType === "application/vnd.google-apps.presentation";
  var startTime = Date.now();

  if (isNativeSlides) {
    logStage("NATIVE_CHECK", "OK", "Native Google Slides — skip conversion");
    return openAndCount(token, fileId, fileName, mimeType, logs, stages, logStage, res, startTime, fileId, discoveredItems);
  }

  // ── PPTX CONVERSION PATH ──
  logStage("CONVERSION", "START", "Copy .pptx → Google Slides");

  var copyBody = JSON.stringify({ name: fileName, mimeType: "application/vnd.google-apps.presentation" });
  logStage("CONVERSION", "REQUEST", "POST /drive/v3/files/" + fileId + "/copy body=" + copyBody);

  return gapi(token, "https://www.googleapis.com/drive/v3/files/" + fileId + "/copy", {
    method: "POST",
    body: copyBody,
  }).then(function(copied) {
    logStage("CONVERSION", copied.ok ? "OK" : "FAIL", "status=" + copied.status + " id=" + (copied.data.id || "null"));

    if (!copied.ok) {
      return res.end(JSON.stringify({
        ok: false, stages: stages, logs: logs,
        error: "Copy failed: " + (copied.data.error ? (copied.data.error.message + " code=" + copied.data.error.code) : copied.body),
        httpStatus: copied.status,
        googleResponse: copied.data,
        rawResponse: copied.body,
        discoveredItems: discoveredItems,
      }));
    }

    if (!copied.data.id) {
      return res.end(JSON.stringify({
        ok: false, stages: stages, logs: logs,
        error: "No presentationId returned",
        googleResponse: copied.data,
        discoveredItems: discoveredItems,
      }));
    }

    var presId = copied.data.id;
    logStage("PERSIST", "START", "Moving to 07 Template Library");

    return findOrCreateTemplateLibrary(token, DRIVE_ROOT, logs).then(function(tmplLibId) {
      if (!tmplLibId) { logStage("PERSIST", "SKIP", "No Template Library"); return presId; }
      return gapi(token, "https://www.googleapis.com/drive/v3/files/" + presId + "?addParents=" + tmplLibId + "&supportsAllDrives=true", { method: "PATCH" })
        .then(function() { logStage("PERSIST", "OK", "moved"); return presId; })
        .catch(function() { return presId; });
    }).then(function(presId) {
      return openAndCount(token, presId, fileName, mimeType, logs, stages, logStage, res, startTime, presId, discoveredItems);
    });
  }).catch(function(err) {
    logStage("CONVERSION", "EXCEPTION", err.message || String(err));
    res.status(500).end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "Conversion exception: " + (err.message || String(err)), discoveredItems: discoveredItems }));
  });
}

// ── Open & Count ──────────────────────────────────────────

function openAndCount(token, presId, fileName, mimeType, logs, stages, logStage, res, startTime, convertedPresId, discoveredItems) {
  logStage("OPEN", "START", "Opening " + presId.substring(0, 12) + "...");

  return gapi(token,
    "https://slides.googleapis.com/v1/presentations/" + presId
  ).then(function(pres) {
    var slideCount = (pres.data.slides || []).length;
    var presTitle = pres.data.title || "(no title)";
    logStage("OPEN", pres.ok ? "OK" : "FAIL", "status=" + pres.status + " title='" + presTitle + "' slides=" + slideCount + " bodySize=" + pres.body.length + "b");

    if (!pres.ok) {
      return res.end(JSON.stringify({
        ok: false, stages: stages, logs: logs,
        error: "Slides API failed: " + (pres.data.error ? pres.data.error.message : pres.body),
        httpStatus: pres.status, googleResponse: pres.data, rawResponse: pres.body,
        presentationId: convertedPresId, discoveredItems: discoveredItems,
      }));
    }

    var slides = pres.data.slides || [];
    var duration = Date.now() - startTime;
    logStage("COMPLETE", "OK", slides.length + " slides in " + duration + "ms");

    return res.end(JSON.stringify({
      ok: true, stages: stages, logs: logs, fileName: fileName, fileId: presId,
      mimeType: mimeType, presentationId: convertedPresId,
      isNative: mimeType === "application/vnd.google-apps.presentation",
      slideCount: slides.length, durationMs: duration,
      discoveredItems: discoveredItems,
      slides: slides.map(function(s) { return { slideId: s.objectId, layout: (s.slideProperties && s.slideProperties.layout && s.slideProperties.layout.predefinedLayout) || "custom" }; }),
    }));
  }).catch(function(err) {
    logStage("OPEN", "EXCEPTION", err.message || String(err));
    res.status(500).end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "Open exception: " + (err.message || String(err)), presentationId: convertedPresId, discoveredItems: discoveredItems }));
  });
}

// ── Helpers ───────────────────────────────────────────────

function findOrCreateTemplateLibrary(token, rootId, logs) {
  var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + rootId + "' in parents and name='07 Template Library' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    if (search.files && search.files[0]) return search.files[0].id;
    return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "07 Template Library", mimeType: "application/vnd.google-apps.folder", parents: [rootId] }),
    }).then(function(r) { return r.json(); }).then(function(folder) {
      logs.push("Created 07 Template Library: " + folder.id);
      return folder.id;
    });
  }).catch(function() { return null; });
}
