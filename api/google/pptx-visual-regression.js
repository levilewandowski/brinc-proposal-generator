// ═══════════════════════════════════════════════════════════
//  Visual Regression — Compare output against canonical originals
//  Uses Google Slides API to get thumbnails and element counts.
//  Practical serverless approach: no local rendering needed.
// ═══════════════════════════════════════════════════════════

import { gapi } from "./pptx-slide-ops.js";

/**
 * Get visual metrics for a Google Slides presentation.
 * Returns: element counts, thumbnail URL, dimensions per slide.
 */
export async function getVisualMetrics(presentationId, token, logger) {
  logger.log("[VIS] Getting metrics for: " + presentationId.substring(0, 12) + "...");
  try {
    var result = await gapi(token, "https://slides.googleapis.com/v1/presentations/" + presentationId + "?fields=presentationId,pageSize,slides(objectId,pageElements(objectId))");
    if (!result.ok) {
      logger.log("[VIS] Failed to get presentation: HTTP " + result.status);
      return null;
    }

    var pres = result.data;
    var slides = pres.slides || [];
    var pageSize = pres.pageSize || {};

    var slideMetrics = [];
    for (var i = 0; i < slides.length; i++) {
      var slide = slides[i];
      var elements = slide.pageElements || [];

      // Get thumbnail
      var thumbResult = await gapi(token, "https://slides.googleapis.com/v1/presentations/" + presentationId + "/pages/" + slide.objectId + "/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=MEDIUM");
      var thumbUrl = (thumbResult.ok && thumbResult.data.contentUrl) ? thumbResult.data.contentUrl : null;

      slideMetrics.push({
        slideId: slide.objectId,
        slideIndex: i,
        elementCount: elements.length,
        thumbnailUrl: thumbUrl,
      });
    }

    return {
      presentationId: presentationId,
      slideCount: slides.length,
      width: pageSize.width || {},
      height: pageSize.height || {},
      slides: slideMetrics,
    };
  } catch (err) {
    logger.log("[VIS] Error: " + (err.message || String(err)));
    return null;
  }
}

/**
 * Compare output visual metrics against original canonical metrics.
 * Returns similarity scores per slide.
 */
export function compareVisualMetrics(originalMetrics, outputMetrics, logger) {
  if (!originalMetrics || !outputMetrics) {
    return { overallSimilarity: 0, perSlide: [], error: "Missing metrics" };
  }

  var comparisons = [];
  var totalElementDiff = 0;
  var totalElements = 0;

  for (var i = 0; i < originalMetrics.slides.length; i++) {
    var orig = originalMetrics.slides[i];
    // Match by slide index in output (may have placeholders interleaved)
    var out = outputMetrics.slides[i] || null;

    if (!out) {
      comparisons.push({
        slideIndex: i,
        originalElements: orig.elementCount,
        outputElements: 0,
        elementSimilarity: 0,
        hasThumbnail: false,
        status: "missing_in_output",
      });
      totalElementDiff += orig.elementCount;
      totalElements += orig.elementCount;
      continue;
    }

    var diff = Math.abs(orig.elementCount - out.elementCount);
    var max = Math.max(orig.elementCount, out.elementCount);
    var similarity = max > 0 ? Math.round((1 - diff / max) * 100) : 100;

    comparisons.push({
      slideIndex: i,
      originalElements: orig.elementCount,
      outputElements: out.elementCount,
      elementSimilarity: similarity,
      hasThumbnail: !!(orig.thumbnailUrl && out.thumbnailUrl),
      originalThumbnail: orig.thumbnailUrl,
      outputThumbnail: out.thumbnailUrl,
      status: similarity >= 90 ? "match" : similarity >= 70 ? "partial" : "different",
    });

    totalElementDiff += diff;
    totalElements += max;
  }

  var overallSimilarity = totalElements > 0 ? Math.round((1 - totalElementDiff / totalElements) * 100) : 100;

  logger.log("[VIS] Overall element similarity: " + overallSimilarity + "%");
  comparisons.forEach(function(c) {
    logger.log("[VIS]   Slide " + c.slideIndex + ": " + c.status + " (" + c.elementSimilarity + "% similar, " + c.originalElements + " -> " + c.outputElements + " elements)");
  });

  return {
    overallSimilarity: overallSimilarity,
    perSlide: comparisons,
  };
}

/**
 * Get the cached Google Slides file ID for a canonical module.
 */
export async function resolveCachedSlides(moduleName, cacheFolderId, token, logger) {
  if (!cacheFolderId) return null;
  var baseName = "canonical_" + moduleName;
  try {
    var q = "'" + cacheFolderId + "' in parents and trashed=false and mimeType='application/vnd.google-apps.presentation' and name contains '" + baseName + "'";
    var result = await gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives");
    if (result.ok && result.data.files && result.data.files.length > 0) {
      return result.data.files[0].id;
    }
  } catch (e) {
    logger.log("[VIS] Cache lookup failed: " + (e.message || ""));
  }
  return null;
}
