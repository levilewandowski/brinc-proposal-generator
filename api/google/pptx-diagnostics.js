// ═══════════════════════════════════════════════════════════
//  POST /api/google/pptx-diagnostics
//  Hardened — every path returns JSON, zero uncaught exceptions.
// ═══════════════════════════════════════════════════════════

import { assemble } from "./pptx-assembler.js";
import { gapi } from "./pptx-slide-ops.js";
import { getVisualMetrics, resolveCachedSlides } from "./pptx-visual-regression.js";

var CANONICAL_COMPONENTS_FOLDER_ID = process.env.CANONICAL_COMPONENTS_FOLDER_ID || "";
var CANONICAL_CACHE_FOLDER_ID = process.env.CANONICAL_CACHE_FOLDER_ID || "";

// ── Safe JSON response ────────────────────────────────────

function safeJson(obj) {
  try { return JSON.stringify(obj); } catch (e) {
    try { return JSON.stringify({ ok: false, error: "JSON serialization failed: " + (e && e.message), fallback: String(obj) }); } catch (e2) {
      return '{"ok":false,"error":"total JSON failure"}';
    }
  }
}

function sendJson(res, statusCode, obj) {
  try {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    return res.end(safeJson(obj));
  } catch (e) {
    try { res.statusCode = 500; res.end('{"ok":false,"error":"response send failure"}'); } catch (e2) { /* last resort */ }
  }
}

// ── Logger ────────────────────────────────────────────────

function createLogger() {
  var logs = [];
  return {
    log: function(msg) {
      try {
        var line = "[DIAG] " + String(msg);
        logs.push(line);
        console.log(line);
      } catch (e) { /* never let logging crash */ }
    },
    getLogs: function() { return logs; },
  };
}

// ── Main handler with absolute top-level catch ────────────

export default async function handler(req, res) {
  var logger = createLogger();
  var startTime = Date.now();

  try {
    // CORS + preflight
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") { return sendJson(res, 204, {}); }
    if (req.method !== "POST") { return sendJson(res, 405, { ok: false, error: "POST only" }); }

    // Parse body safely
    var body = {};
    try { body = req.body || {}; } catch (e) { body = {}; }

    // Auth
    var accessToken = body.accessToken || "";
    var refreshToken = body.refreshToken || "";

    if (!accessToken) {
      try {
        var authHeader = req.headers.authorization || "";
        if (authHeader.toLowerCase().startsWith("bearer ")) accessToken = authHeader.substring(7).trim();
      } catch (e) { /* ignore header parse errors */ }
    }

    if (!accessToken) {
      return sendJson(res, 401, { ok: false, error: "Missing accessToken — provide in body or Authorization: Bearer header" });
    }

    logger.log("=== DIAGNOSTICS RUN ===");
    var modules = body.modules || ["why_brinc"];
    logger.log("Modules: [" + modules.join(", ") + "]");
    logger.log("Folder: " + (CANONICAL_COMPONENTS_FOLDER_ID ? "set" : "NOT_SET"));
    logger.log("Cache: " + (CANONICAL_CACHE_FOLDER_ID ? "set" : "NOT_SET"));

    // ── Token validation + refresh ────────────────────────
    logger.log("--- AUTH ---");
    if (refreshToken) {
      try {
        var tokenCheck = await gapi(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken);
        if (!tokenCheck.ok) {
          logger.log("Token invalid (HTTP " + tokenCheck.status + "), refreshing...");
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
            return sendJson(res, 401, {
              ok: false, error: "AUTH_FAILED",
              detail: "Token expired and refresh failed: " + (refreshData.error || "unknown"),
              logs: logger.getLogs(),
            });
          }
        } else {
          logger.log("Token valid");
        }
      } catch (authErr) {
        logger.log("Auth check error: " + (authErr && authErr.message ? authErr.message : ""));
      }
    } else {
      logger.log("No refresh token — using access token as-is");
    }

    // ── Assemble ──────────────────────────────────────────
    logger.log("--- ASSEMBLY ---");
    var asmStart = Date.now();
    var result;
    try {
      var slideSources = modules.map(function(m) { return { source: "canonical", module: m }; });
      result = await assemble(slideSources, accessToken, logger);
    } catch (asmErr) {
      logger.log("Assembly exception: " + (asmErr && asmErr.message ? asmErr.message : String(asmErr)));
      return sendJson(res, 500, {
        ok: false, phase: "assembly",
        error: asmErr && asmErr.message ? asmErr.message : "Assembly failed",
        stack: asmErr && asmErr.stack ? asmErr.stack.substring(0, 500) : null,
        timing: { totalMs: Date.now() - startTime },
        logs: logger.getLogs(),
      });
    }
    var asmElapsed = Date.now() - asmStart;

    if (!result || !result.ok) {
      return sendJson(res, 500, {
        ok: false, phase: "assembly",
        error: (result && result.error) ? result.error : "Assembly returned not-ok",
        timing: { totalMs: Date.now() - startTime, assemblyMs: asmElapsed },
        logs: logger.getLogs(),
      });
    }

    logger.log("Assembly: " + result.slideCount + " slides, " + Math.round(result.sizeBytes / 1024) + " KB in " + asmElapsed + "ms");

    // ── Upload to Drive (as Google Slides conversion) ─────
    logger.log("--- UPLOAD ---");
    var uploadStart = Date.now();
    var uploadResult = null;
    var outputPresentationId = null;
    try {
      var boundary = "-------diag_boundary_" + Date.now();
      var metadata = JSON.stringify({
        name: "DIAGNOSTIC_" + modules.join("_") + "_" + Date.now(),
        mimeType: "application/vnd.google-apps.presentation",
      });

      // Build multipart body manually (Buffer-based, no Blob)
      var metaPart = Buffer.from("\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + metadata, "utf8");
      var filePart = Buffer.concat([
        Buffer.from("\r\n--" + boundary + "\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n", "utf8"),
        Buffer.from(result.buffer),
        Buffer.from("\r\n--" + boundary + "--", "utf8"),
      ]);
      var requestBody = Buffer.concat([metaPart, filePart]);

      var upRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "multipart/related; boundary=" + boundary,
          "Content-Length": String(requestBody.length),
        },
        body: requestBody,
      });

      var upData = await upRes.json();
      if (upRes.ok && upData.id) {
        outputPresentationId = upData.id;
        uploadResult = {
          id: upData.id,
          webViewLink: "https://drive.google.com/file/d/" + upData.id + "/view",
          downloadLink: "https://drive.google.com/uc?export=download&id=" + upData.id,
        };
        logger.log("Uploaded + converted: " + upData.id.substring(0, 12));
      } else {
        logger.log("Upload HTTP " + upRes.status + ": " + (upData.error ? upData.error.message : "unknown"));
      }
    } catch (upErr) {
      logger.log("Upload exception: " + (upErr && upErr.message ? upErr.message : String(upErr)));
    }
    var uploadElapsed = Date.now() - uploadStart;

    // ── Visual regression ─────────────────────────────────
    logger.log("--- VISUAL ---");
    var visualRegression = null;
    if (outputPresentationId && CANONICAL_CACHE_FOLDER_ID) {
      try {
        var outputMetrics = await getVisualMetrics(outputPresentationId, accessToken, logger);
        if (outputMetrics) {
          visualRegression = {
            outputSlideCount: outputMetrics.slideCount,
            comparisons: [],
          };

          for (var mi = 0; mi < modules.length; mi++) {
            try {
              var cachedId = await resolveCachedSlides(modules[mi], CANONICAL_CACHE_FOLDER_ID, accessToken, logger);
              if (!cachedId) {
                visualRegression.comparisons.push({ module: modules[mi], status: "no_cache" });
                continue;
              }
              var origMetrics = await getVisualMetrics(cachedId, accessToken, logger);
              if (!origMetrics || !origMetrics.slides[0]) {
                visualRegression.comparisons.push({ module: modules[mi], status: "no_original_data" });
                continue;
              }

              var outSlide = outputMetrics.slides[mi] || null;
              var origSlide = origMetrics.slides[0];
              if (outSlide) {
                var diff = Math.abs(origSlide.elementCount - outSlide.elementCount);
                var max = Math.max(origSlide.elementCount, outSlide.elementCount);
                var similarity = max > 0 ? Math.round((1 - diff / max) * 100) : 100;
                visualRegression.comparisons.push({
                  module: modules[mi],
                  elementSimilarity: similarity,
                  originalElements: origSlide.elementCount,
                  outputElements: outSlide.elementCount,
                  originalThumbnail: origSlide.thumbnailUrl,
                  outputThumbnail: outSlide.thumbnailUrl,
                  status: similarity >= 90 ? "match" : similarity >= 70 ? "partial" : "different",
                });
                logger.log(modules[mi] + ": " + similarity + "% (" + origSlide.elementCount + " -> " + outSlide.elementCount + ")");
              } else {
                visualRegression.comparisons.push({ module: modules[mi], status: "output_slide_missing" });
              }
            } catch (modErr) {
              logger.log(modules[mi] + " visual error: " + (modErr && modErr.message ? modErr.message : ""));
              visualRegression.comparisons.push({ module: modules[mi], status: "error" });
            }
          }

          var totalSim = visualRegression.comparisons.reduce(function(s, c) { return s + (c.elementSimilarity || 0); }, 0);
          var count = visualRegression.comparisons.filter(function(c) { return c.elementSimilarity !== undefined; }).length;
          visualRegression.overallSimilarity = count > 0 ? Math.round(totalSim / count) : 0;
          logger.log("Overall: " + visualRegression.overallSimilarity + "%");
        }
      } catch (visErr) {
        logger.log("Visual regression exception: " + (visErr && visErr.message ? visErr.message : ""));
      }
    } else {
      logger.log("Skipped: no output presentation or cache folder");
    }

    // ── Build response ────────────────────────────────────
    var validation = result.validation || {};
    var vRel = validation.relationships || {};
    var renderCritical = vRel.renderCriticalCount || 0;
    var response = {
      ok: true,
      timing: {
        totalMs: Date.now() - startTime,
        assemblyMs: asmElapsed,
        uploadMs: uploadElapsed,
      },
      assembly: {
        slideCount: result.slideCount || 0,
        sizeBytes: result.sizeBytes || 0,
        sizeKb: Math.round((result.sizeBytes || 0) / 1024),
      },
      validation: {
        pass: (validation.ok === true && renderCritical === 0) || false,
        xmlPass: validation.ok || false,
        slideCount: (validation.structure || {}).slideCount || 0,
        mediaTotal: (validation.media || {}).total || 0,
        mediaMissing: (validation.media || {}).missing || 0,
        relationshipsTotal: vRel.total || 0,
        relationshipsBrokenCount: (vRel.broken || []).length,
        relationshipsRenderCritical: renderCritical,
        relationshipsRenderCriticalList: (vRel.broken || []).filter(function(b) { return b.renderCritical; }).map(function(b) { return { typeShort: b.typeShort, target: b.target, resolved: b.resolvedEntryName }; }),
        relationshipsBrokenFull: (vRel.broken || []).map(function(b) { return { typeShort: b.typeShort, type: b.type, rId: b.rId, target: b.target, resolved: b.resolvedEntryName, sourcePart: b.sourcePart || b.relFile, renderCritical: b.renderCritical }; }),
        textRuns: (validation.editability || {}).textRuns || 0,
        shapes: (validation.editability || {}).shapes || 0,
        images: (validation.editability || {}).images || 0,
        errors: (validation.errors || []).slice(0, 10),
      },
      drive: uploadResult,
      visualRegression: visualRegression,
      logs: logger.getLogs(),
    };

    return sendJson(res, response.validation.pass ? 200 : 207, response);

  } catch (fatalErr) {
    console.error("[DIAG_FATAL]", fatalErr);
    var logs = [];
    try { logs = logger.getLogs(); } catch (e) { }
    return sendJson(res, 500, {
      ok: false,
      error: fatalErr && fatalErr.message ? fatalErr.message : String(fatalErr),
      stack: fatalErr && fatalErr.stack ? fatalErr.stack.substring(0, 500) : null,
      timing: { totalMs: Date.now() - startTime },
      logs: logs,
    });
  }
}
