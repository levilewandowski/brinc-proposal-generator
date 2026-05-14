// api/google/test-import.js — Minimal PPTX → Google Slides conversion test
// Isolates conversion failures without DNA/indexing complexity

import { resolveWorkspaceRoot } from "./workspace.js";

function gapi(token, url, init) {
  return fetch(url, Object.assign({}, init, {
    headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
  })).then(function(r) {
    return r.text().then(function(t) {
      var d = {};
      try { d = t ? JSON.parse(t) : {}; } catch(e) {}
      return { ok: r.ok, status: r.status, data: d, body: t ? t.substring(0, 2000) : "" };
    });
  });
}

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  var token = req.query.accessToken || ((req.body || {}).accessToken);
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  var fileId = req.query.fileId || ((req.body || {}).fileId);
  var fileName = req.query.fileName || ((req.body || {}).fileName) || "test.pptx";
  var mimeType = req.query.mimeType || ((req.body || {}).mimeType) || "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  var logs = [];
  var stages = [];

  function logStage(stage, status, detail) {
    var entry = { stage: stage, status: status, timestamp: new Date().toISOString(), detail: detail || "" };
    stages.push(entry);
    logs.push(stage + ": " + status + (detail ? " — " + detail : ""));
  }

  logStage("INIT", "START", "fileId=" + (fileId || "null") + " mimeType=" + mimeType);

  // ── STAGE 1: Resolve workspace ──
  resolveWorkspaceRoot(token, logs).then(function(resolved) {
    var DRIVE_ROOT = resolved.rootId;
    logStage("WORKSPACE", resolved.rootId ? "OK" : "FAIL", "root=" + (resolved.rootName || "?"));

    if (!DRIVE_ROOT) {
      return res.end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "Cannot resolve workspace" }));
    }

    // ── STAGE 2: Verify file access ──
    if (!fileId) {
      // No fileId provided — try to find first PPTX in 02 Source Decks
      logStage("FIND_FILE", "START", "Looking for first PPTX in 02 Source Decks");
      var sourceQ = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='02 Source Decks' and trashed=false");
      return fetch("https://www.googleapis.com/drive/v3/files?q=" + sourceQ + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
        headers: { Authorization: "Bearer " + token }
      }).then(function(r) { return r.json(); }).then(function(search) {
        var folderId = search.files && search.files[0] && search.files[0].id;
        if (!folderId) {
          logStage("FIND_FOLDER", "FAIL", "02 Source Decks not found");
          return res.end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "02 Source Decks not found" }));
        }
        logStage("FIND_FOLDER", "OK", "02 Source Decks=" + folderId.substring(0, 12) + "...");

        // Broad query — no mimeType filter
        var broadQ = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
        return fetch("https://www.googleapis.com/drive/v3/files?q=" + broadQ
          + "&fields=files(id,name,mimeType,fileExtension)"
          + "&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true", {
          headers: { Authorization: "Bearer " + token }
        }).then(function(r) { return r.json(); }).then(function(list) {
          var files = (list.files || []).filter(function(f) {
            return f.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
                   f.mimeType === "application/vnd.google-apps.presentation" ||
                   (f.name && f.name.toLowerCase().endsWith(".pptx"));
          });
          if (files.length === 0) {
            logStage("FIND_FILE", "FAIL", "No presentation files in 02 Source Decks");
            return res.end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: "No presentation files found" }));
          }
          fileId = files[0].id;
          fileName = files[0].name;
          mimeType = files[0].mimeType;
          logStage("FIND_FILE", "OK", "name='" + fileName + "' mimeType=" + mimeType + " id=" + fileId.substring(0, 12) + "...");
          return runConversion(token, DRIVE_ROOT, fileId, fileName, mimeType, logs, stages, logStage, res);
        });
      });
    }

    // fileId provided — run conversion directly
    return runConversion(token, DRIVE_ROOT, fileId, fileName, mimeType, logs, stages, logStage, res);
  }).catch(function(err) {
    logStage("CRITICAL", "FAIL", err.message || String(err));
    res.status(500).end(JSON.stringify({ ok: false, stages: stages, logs: logs, error: err.message || String(err) }));
  });
}

// ── Core Conversion Logic ─────────────────────────────────

function runConversion(token, DRIVE_ROOT, fileId, fileName, mimeType, logs, stages, logStage, res) {
  var isNativeSlides = mimeType === "application/vnd.google-apps.presentation";
  var startTime = Date.now();

  if (isNativeSlides) {
    // ── NATIVE SLIDES PATH ──
    logStage("NATIVE_CHECK", "OK", "Native Google Slides — skip conversion");
    return openAndCount(token, fileId, fileName, mimeType, logs, stages, logStage, res, startTime, fileId);
  }

  // ── PPTX CONVERSION PATH ──
  logStage("CONVERSION", "START", "Copying .pptx to Google Slides format");

  var copyBody = JSON.stringify({ name: fileName, mimeType: "application/vnd.google-apps.presentation" });
  logStage("CONVERSION", "REQUEST", "POST /drive/v3/files/" + fileId + "/copy body=" + copyBody);

  return gapi(token, "https://www.googleapis.com/drive/v3/files/" + fileId + "/copy", {
    method: "POST",
    body: copyBody,
  }).then(function(copied) {
    logStage("CONVERSION", copied.ok ? "OK" : "FAIL", "status=" + copied.status + " id=" + (copied.data.id || "null"));

    if (!copied.ok) {
      return res.end(JSON.stringify({
        ok: false,
        stages: stages,
        logs: logs,
        error: "Copy failed: " + (copied.data.error ? (copied.data.error.message + " code=" + copied.data.error.code) : copied.body),
        httpStatus: copied.status,
        googleResponse: copied.data,
        rawResponse: copied.body,
      }));
    }

    if (!copied.data.id) {
      logStage("CONVERSION", "FAIL", "No presentationId in response");
      return res.end(JSON.stringify({
        ok: false,
        stages: stages,
        logs: logs,
        error: "No presentationId returned",
        googleResponse: copied.data,
      }));
    }

    var presId = copied.data.id;
    logStage("PERSIST", "START", "Moving to 07 Template Library");

    // Move to 07 Template Library
    return findOrCreateTemplateLibrary(token, DRIVE_ROOT, logs).then(function(tmplLibId) {
      if (!tmplLibId) {
        logStage("PERSIST", "SKIP", "No Template Library folder");
        return presId;
      }
      return gapi(token, "https://www.googleapis.com/drive/v3/files/" + presId + "?addParents=" + tmplLibId + "&supportsAllDrives=true", {
        method: "PATCH"
      }).then(function(moveResult) {
        logStage("PERSIST", moveResult.ok ? "OK" : "WARN", "status=" + moveResult.status);
        return presId;
      }).catch(function(err) {
        logStage("PERSIST", "WARN", "Move error: " + (err.message || String(err)));
        return presId;
      });
    }).then(function(presId) {
      return openAndCount(token, presId, fileName, mimeType, logs, stages, logStage, res, startTime, presId);
    });
  }).catch(function(err) {
    logStage("CONVERSION", "EXCEPTION", err.message || String(err));
    res.status(500).end(JSON.stringify({
      ok: false, stages: stages, logs: logs,
      error: "Conversion exception: " + (err.message || String(err)),
    }));
  });
}

// ── Open Presentation & Count Slides ──────────────────────

function openAndCount(token, presId, fileName, mimeType, logs, stages, logStage, res, startTime, convertedPresId) {
  logStage("OPEN", "START", "Opening presentation " + presId.substring(0, 12) + "...");

  return gapi(token,
    "https://slides.googleapis.com/v1/presentations/" + presId
    + "?fields=presentationId,title,slides(objectId,slideProperties(layout(predefinedLayout)))"
  ).then(function(pres) {
    logStage("OPEN", pres.ok ? "OK" : "FAIL", "status=" + pres.status + " slides=" + ((pres.data.slides || []).length));

    if (!pres.ok) {
      return res.end(JSON.stringify({
        ok: false,
        stages: stages,
        logs: logs,
        error: "Slides API failed: " + (pres.data.error ? pres.data.error.message : pres.body),
        httpStatus: pres.status,
        googleResponse: pres.data,
        rawResponse: pres.body,
        presentationId: convertedPresId,
      }));
    }

    var slides = pres.data.slides || [];
    var duration = Date.now() - startTime;

    logStage("COMPLETE", "OK", slides.length + " slides in " + duration + "ms");

    return res.end(JSON.stringify({
      ok: true,
      stages: stages,
      logs: logs,
      fileName: fileName,
      fileId: presId,
      mimeType: mimeType,
      presentationId: convertedPresId,
      isNative: mimeType === "application/vnd.google-apps.presentation",
      slideCount: slides.length,
      durationMs: duration,
      slides: slides.map(function(s) { return { slideId: s.objectId, layout: (s.slideProperties && s.slideProperties.layout && s.slideProperties.layout.predefinedLayout) || "custom" }; }),
    }));
  }).catch(function(err) {
    logStage("OPEN", "EXCEPTION", err.message || String(err));
    res.status(500).end(JSON.stringify({
      ok: false, stages: stages, logs: logs,
      error: "Open exception: " + (err.message || String(err)),
      presentationId: convertedPresId,
    }));
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
