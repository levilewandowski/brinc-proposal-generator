// ═══════════════════════════════════════════════════════════
//  POST /api/google/pptx-diagnostics
//  Self-contained developer diagnostics endpoint.
//  Triggers a test assembly, returns full validation report.
//  No browser console copy-paste needed.
// ═══════════════════════════════════════════════════════════

import { assemble } from "./pptx-assembler.js";
import { gapi } from "./pptx-slide-ops.js";
import { getVisualMetrics, compareVisualMetrics, resolveCachedSlides } from "./pptx-visual-regression.js";

var CANONICAL_COMPONENTS_FOLDER_ID = process.env.CANONICAL_COMPONENTS_FOLDER_ID || "";
var CANONICAL_CACHE_FOLDER_ID = process.env.CANONICAL_CACHE_FOLDER_ID || "";

function createLogger() {
  var logs = [];
  return {
    log: function(msg) { var line = "[DIAG] " + msg; logs.push(line); console.log(line); },
    getLogs: function() { return logs; },
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ ok: false, error: "POST only" })); }

  var body = req.body || {};
  var accessToken = body.accessToken || "";
  var refreshToken = body.refreshToken || "";

  // Auth from header fallback
  if (!accessToken) {
    var authHeader = req.headers.authorization || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) accessToken = authHeader.substring(7).trim();
  }

  if (!accessToken) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Missing accessToken" }));
  }

  // Token refresh
  if (refreshToken) {
    try {
      var check = await gapi(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken);
      if (!check.ok) {
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
        if (refreshData.access_token) accessToken = refreshData.access_token;
      }
    } catch (e) { /* continue with original token */ }
  }

  var logger = createLogger();
  var startTime = Date.now();
  var modules = body.modules || ["why_brinc"];

  try {
    logger.log("=== DIAGNOSTICS RUN ===");
    logger.log("Modules: [" + modules.join(", ") + "]");

    // Build slide sources
    var slideSources = modules.map(function(m) { return { source: "canonical", module: m }; });

    // Assemble
    var asmStart = Date.now();
    var result = await assemble(slideSources, accessToken, logger);
    var asmElapsed = Date.now() - asmStart;

    if (!result.ok) {
      res.statusCode = 500;
      return res.end(JSON.stringify({
        ok: false,
        phase: "assembly",
        error: "Assembly failed",
        timing: { totalMs: Date.now() - startTime, assemblyMs: asmElapsed },
        logs: logger.getLogs(),
      }));
    }

    // Upload (convert to Google Slides for visual comparison)
    var uploadStart = Date.now();
    var uploadResult = null;
    var outputPresentationId = null;
    try {
      var boundary = "-------diag_boundary_" + Date.now();
      var metadata = JSON.stringify({
        name: "DIAGNOSTIC_" + modules.join("_") + "_" + Date.now(),
        mimeType: "application/vnd.google-apps.presentation", // converts PPTX → Google Slides
      });
      var blobBody = new Blob([
        "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n",
        metadata,
        "\r\n--" + boundary + "\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n",
        new Uint8Array(result.buffer),
        "\r\n--" + boundary + "--",
      ]);
      var upRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "multipart/related; boundary=" + boundary },
        body: blobBody,
      });
      var upData = await upRes.json();
      if (upRes.ok) {
        outputPresentationId = upData.id;
        uploadResult = {
          id: upData.id,
          webViewLink: "https://drive.google.com/file/d/" + upData.id + "/view",
          downloadLink: "https://drive.google.com/uc?export=download&id=" + upData.id,
        };
        logger.log("[DIAG] Uploaded + converted to Google Slides: " + upData.id.substring(0, 12));
      }
    } catch (upErr) {
      logger.log("Upload failed: " + (upErr.message || ""));
    }
    var uploadElapsed = Date.now() - uploadStart;

    // Visual regression: compare output against cached canonical originals
    var visualRegression = null;
    if (outputPresentationId && CANONICAL_CACHE_FOLDER_ID) {
      logger.log("[DIAG] === VISUAL REGRESSION ===");
      var visStart = Date.now();
      try {
        // Get output metrics
        var outputMetrics = await getVisualMetrics(outputPresentationId, accessToken, logger);

        // Get original metrics for each canonical module
        var originalMetrics = [];
        for (var mi = 0; mi < modules.length; mi++) {
          var cachedId = await resolveCachedSlides(modules[mi], CANONICAL_CACHE_FOLDER_ID, accessToken, logger);
          if (cachedId) {
            var metrics = await getVisualMetrics(cachedId, accessToken, logger);
            if (metrics) originalMetrics.push({ module: modules[mi], metrics: metrics });
          }
        }

        // Compare
        if (originalMetrics.length > 0 && outputMetrics) {
          // Compare first canonical against corresponding output slide
          visualRegression = {
            outputMetrics: {
              presentationId: outputMetrics.presentationId,
              slideCount: outputMetrics.slideCount,
            },
            comparisons: [],
          };

          for (var ci = 0; ci < originalMetrics.length; ci++) {
            var orig = originalMetrics[ci];
            // Map: output slide at index ci corresponds to canonical module at index ci
            var outSlide = outputMetrics.slides[ci] || null;
            var origSlide = orig.metrics.slides[0] || null; // canonical has 1 slide

            if (origSlide && outSlide) {
              var diff = Math.abs(origSlide.elementCount - outSlide.elementCount);
              var max = Math.max(origSlide.elementCount, outSlide.elementCount);
              var similarity = max > 0 ? Math.round((1 - diff / max) * 100) : 100;

              visualRegression.comparisons.push({
                module: orig.module,
                originalElements: origSlide.elementCount,
                outputElements: outSlide.elementCount,
                elementSimilarity: similarity,
                originalThumbnail: origSlide.thumbnailUrl,
                outputThumbnail: outSlide.thumbnailUrl,
                status: similarity >= 90 ? "match" : similarity >= 70 ? "partial" : "different",
              });

              logger.log("[VIS] " + orig.module + ": " + similarity + "% similar (" + origSlide.elementCount + " -> " + outSlide.elementCount + " elements)");
            } else {
              visualRegression.comparisons.push({
                module: orig.module,
                status: outSlide ? "original_unavailable" : "output_unavailable",
              });
            }
          }

          // Overall score
          var totalSim = visualRegression.comparisons.reduce(function(sum, c) { return sum + (c.elementSimilarity || 0); }, 0);
          visualRegression.overallSimilarity = visualRegression.comparisons.length > 0 ? Math.round(totalSim / visualRegression.comparisons.length) : 0;
          logger.log("[VIS] Overall similarity: " + visualRegression.overallSimilarity + "%");
        }
      } catch (visErr) {
        logger.log("[VIS] Visual regression error: " + (visErr.message || ""));
      }
      logger.log("[VIS] Visual regression took " + (Date.now() - visStart) + "ms");
    }

    // Build response
    var validation = result.validation || {};
    var response = {
      ok: true,
      timing: {
        totalMs: Date.now() - startTime,
        assemblyMs: asmElapsed,
        uploadMs: uploadElapsed,
      },
      assembly: {
        slideCount: result.slideCount,
        sizeBytes: result.sizeBytes,
        sizeKb: Math.round(result.sizeBytes / 1024),
      },
      validation: {
        pass: (validation.ok && (validation.relationships.renderCriticalCount || 0) === 0) || false,
        xmlPass: validation.ok || false,
        slideCount: (validation.structure || {}).slideCount || 0,
        mediaTotal: (validation.media || {}).total || 0,
        mediaMissing: (validation.media || {}).missing || 0,
        relationshipsTotal: (validation.relationships || {}).total || 0,
        relationshipsBroken: (validation.relationships || {}).broken || [],
        relationshipsBrokenCount: ((validation.relationships || {}).broken || []).length,
        relationshipsRenderCritical: (validation.relationships || {}).renderCriticalCount || 0,
        relationshipsRenderCriticalList: ((validation.relationships || {}).broken || []).filter(function(b) { return b.renderCritical; }),
        textRuns: (validation.editability || {}).textRuns || 0,
        shapes: (validation.editability || {}).shapes || 0,
        images: (validation.editability || {}).images || 0,
        contentTypeMissing: (validation.contentTypes || {}).missing || [],
        errors: validation.errors || [],
      },
      drive: uploadResult,
      visualRegression: visualRegression,
      logs: logger.getLogs(),
    };

    res.statusCode = validation.ok ? 200 : 207;
    res.end(JSON.stringify(response));

  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: err.message || String(err),
      timing: { totalMs: Date.now() - startTime },
      logs: logger.getLogs(),
    }));
  }
}
