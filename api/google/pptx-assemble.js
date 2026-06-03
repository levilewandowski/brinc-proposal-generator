// ═══════════════════════════════════════════════════════════
//  POST /api/google/pptx-assemble
//  PPTX-first assembly endpoint — exact slides + placeholders
//  Phase 1: canonical + retrieved + generated placeholders
//  Does NOT modify existing Google Slides flow
// ═══════════════════════════════════════════════════════════

import { assemble } from "./pptx-assembler.js";
import { gapi } from "./pptx-slide-ops.js";

var CANONICAL_COMPONENTS_FOLDER_ID = process.env.CANONICAL_COMPONENTS_FOLDER_ID || "";
var WORKSPACE_ROOT_ID = process.env.WORKSPACE_ROOT_ID || "";

function createLogger() {
  var logs = [];
  return {
    log: function(msg) { var line = "[ASM] " + msg; logs.push(line); console.log(line); },
    getLogs: function() { return logs; },
  };
}

// ── Drive Upload ──────────────────────────────────────────

async function uploadToDrive(buffer, title, parentFolderId, token, logger) {
  logger.log("Uploading to Drive: " + title);

  // Create multipart upload
  var boundary = "-------asm_boundary_" + Date.now();
  var metadata = JSON.stringify({
    name: title,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    parents: parentFolderId ? [parentFolderId] : undefined,
  });

  var delimiter = "\r\n--" + boundary + "\r\n";
  var closeDelimiter = "\r\n--" + boundary + "--";

  var body = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    metadata,
    delimiter,
    "Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n",
    new Uint8Array(buffer),
    closeDelimiter,
  ]);

  var response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "multipart/related; boundary=" + boundary,
    },
    body: body,
  });

  var result = await response.json();
  if (!response.ok) {
    throw new Error("Upload failed: HTTP " + response.status + " " + (result.error ? result.error.message : ""));
  }

  logger.log("Uploaded: " + result.id);
  return {
    id: result.id,
    webViewLink: "https://drive.google.com/file/d/" + result.id + "/view",
    downloadLink: "https://drive.google.com/uc?export=download&id=" + result.id,
  };
}

// ── Resolve Target Folder ─────────────────────────────────

async function resolveTargetFolder(resolvedRootId, token, logger) {
  if (!resolvedRootId) {
    logger.log("No workspace root — skipping folder move");
    return null;
  }

  // Find "01 Generated Proposals" folder
  var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + resolvedRootId + "' in parents and name='01 Generated Proposals' and trashed=false");
  var searchResult = await gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives");

  if (searchResult.ok && searchResult.data.files && searchResult.data.files.length > 0) {
    logger.log("Found 01 Generated Proposals: " + searchResult.data.files[0].id.substring(0, 12));
    return searchResult.data.files[0].id;
  }

  // Create folder
  logger.log("Creating 01 Generated Proposals folder");
  var createResult = await gapi(token, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    body: JSON.stringify({
      name: "01 Generated Proposals",
      mimeType: "application/vnd.google-apps.folder",
      parents: [resolvedRootId],
    }),
  });

  if (createResult.ok && createResult.data.id) {
    return createResult.data.id;
  }

  logger.log("Failed to create folder — uploading to root");
  return null;
}

// ── Main Handler ──────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed. Use POST." }));
  }

  // Auth — same pattern as /api/google/slides.js
  var body = req.body || {};
  var accessToken = body.accessToken || "";
  var refreshToken = body.refreshToken || "";

  // Also accept from Authorization header
  if (!accessToken) {
    var authHeader = req.headers.authorization || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      accessToken = authHeader.substring(7).trim();
    }
  }

  if (!accessToken) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Missing accessToken — provide in body or Authorization: Bearer header" }));
  }

  var logger = createLogger();
  var startTime = Date.now();

  // Token refresh (mirrors slides.js logic)
  if (refreshToken) {
    try {
      var tokenCheck = await gapi(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken);
      if (!tokenCheck.ok) {
        logger.log("Token invalid, refreshing...");
        var refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID || "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
            grant_type: "refresh_token",
          }),
        });
        var refreshData = await refreshRes.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          logger.log("Token refreshed successfully");
        } else {
          logger.log("Token refresh failed: " + (refreshData.error || "unknown"));
        }
      }
    } catch (authErr) {
      logger.log("Token check/refresh error: " + (authErr.message || ""));
    }
  }

  try {
    var title = body.title || "Brinc Proposal";
    var modules = body.modules || [];
    var archetypeKey = body.archetype || "default";
    var debug = !!body.debug;

    logger.log("=== PPTX ASSEMBLY START ===");
    logger.log("Title: " + title);
    logger.log("Archetype: " + archetypeKey);
    logger.log("Modules: [" + modules.join(", ") + "]");
    logger.log("PPTX-first: true");

    // ── Build Slide Sources ───────────────────────────────

    var slideSources = [];

    // Canonical slides (exact from source PPTX)
    modules.forEach(function(mod) {
      slideSources.push({
        source: "canonical",
        module: mod,
      });
    });

    // If no modules, add a single placeholder
    if (slideSources.length === 0) {
      slideSources.push({
        source: "generated",
        title: title,
        subtitle: "PPTX Assembly — No modules selected",
      });
    }

    logger.log("Slide plan: " + slideSources.length + " slide(s)");
    slideSources.forEach(function(s, i) {
      logger.log("  [" + i + "] " + s.source + (s.module ? ":" + s.module : "") + (s.fileId ? ":" + s.fileId.substring(0, 8) : ""));
    });

    // ── Assemble ──────────────────────────────────────────

    var result = await assemble(slideSources, accessToken, logger);

    if (!result.ok) {
      res.statusCode = 500;
      return res.end(JSON.stringify({
        ok: false,
        error: "Assembly failed",
        logs: logger.getLogs(),
      }));
    }

    // ── Upload to Drive ───────────────────────────────────

    logger.log("=== DRIVE UPLOAD ===");

    // Resolve workspace for folder placement
    // workspace.js expects a logs ARRAY with .push() — not the logger object
    var targetFolderId = null;
    try {
      var { resolveWorkspaceRoot } = await import("./workspace.js");
      var wsLogs = []; // array with .push() for workspace.js compatibility
      var workspace = await resolveWorkspaceRoot(accessToken, wsLogs);
      wsLogs.forEach(function(entry) { logger.log(entry); }); // copy to main logger
      if (workspace.rootId) {
        targetFolderId = await resolveTargetFolder(workspace.rootId, accessToken, logger);
      }
    } catch (wsErr) {
      logger.log("Workspace resolution skipped: " + (wsErr.message || ""));
    }

    var uploadResult = await uploadToDrive(result.buffer, title + ".pptx", targetFolderId, accessToken, logger);

    logger.log("=== COMPLETE ===");
    logger.log("Slide count: " + result.slideCount);
    logger.log("File size: " + Math.round(result.sizeBytes / 1024) + " KB");
    logger.log("Drive link: " + uploadResult.webViewLink);

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      presentationId: uploadResult.id,
      title: title,
      webViewLink: uploadResult.webViewLink,
      downloadLink: uploadResult.downloadLink,
      slideCount: result.slideCount,
      sizeBytes: result.sizeBytes,
      folderPath: targetFolderId ? "01 Generated Proposals" : "",
      pptxFirst: true,
      elapsedMs: Date.now() - startTime,
      logs: debug ? logger.getLogs() : undefined,
      moduleCount: modules.length,
    }));

  } catch (err) {
    console.error("[pptx-assemble] Fatal:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: err.message || String(err),
      logs: logger.getLogs(),
    }));
  }
}
