// ═══════════════════════════════════════════════════════════
//  PPTX Validator — Post-assembly validation tooling
//  Checks: media integrity, rel consistency, editability, structure
//  Never modifies files — read-only validation.
// ═══════════════════════════════════════════════════════════

import { XMLParser } from "fast-xml-parser";

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };

// ═══════════════════════════════════════════════════════════
//  Main Validation Entry
// ═══════════════════════════════════════════════════════════

export async function validatePptx(zipBuffer, logger) {
  var JSZipModule = await import("jszip");
  var JSZip = JSZipModule.default || JSZipModule;
  var zip = await JSZip.loadAsync(zipBuffer);
  var parser = new XMLParser(XML_OPTS);

  var report = {
    ok: true,
    structure: {},
    slides: [],
    media: { total: 0, missing: 0, broken: [] },
    relationships: { total: 0, broken: [] },
    editability: { textRuns: 0, shapes: 0, images: 0 },
    contentTypes: { defaults: 0, missing: [] },
    errors: [],
  };

  logger.log("[VAL] === VALIDATION START ===");

  // 1. Structure check
  await validateStructure(zip, report, logger);

  // 2. Content types
  await validateContentTypes(zip, report, logger);

  // 3. Per-slide validation
  await validateSlides(zip, parser, report, logger);

  // 4. Cross-reference check (rels → files)
  await validateRelationships(zip, parser, report, logger);

  // 5. Final summary
  report.ok = report.errors.length === 0 && report.media.missing === 0 && report.relationships.broken.length === 0;
  logger.log("[VAL] === VALIDATION " + (report.ok ? "PASS" : "FAIL") + " ===");
  logger.log("[VAL] Slides: " + report.structure.slideCount + ", Media: " + report.media.total + ", Missing: " + report.media.missing);
  logger.log("[VAL] Text runs: " + report.editability.textRuns + ", Shapes: " + report.editability.shapes + ", Images: " + report.editability.images);

  return report;
}

// ═══════════════════════════════════════════════════════════
//  1. Structure Validation
// ═══════════════════════════════════════════════════════════

async function validateStructure(zip, report, logger) {
  var requiredFiles = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
  ];

  var missing = [];
  requiredFiles.forEach(function(f) {
    if (!zip.file(f)) missing.push(f);
  });

  if (missing.length > 0) {
    report.errors.push("Missing required files: " + missing.join(", "));
    logger.log("[VAL] STRUCTURE_FAIL: missing " + missing.join(", "));
  }

  // Count slides
  var slideFiles = Object.keys(zip.files).filter(function(f) {
    return /^ppt\/slides\/slide\d+\.xml$/.test(f);
  }).sort();

  // Count via presentation.xml
  var presEntry = zip.file("ppt/presentation.xml");
  var presSlideCount = 0;
  if (presEntry) {
    var presText = await presEntry.async("text");
    var sldIdMatches = presText.match(/<p:sldId\s/g) || [];
    presSlideCount = sldIdMatches.length;
  }

  report.structure = {
    slideCount: slideFiles.length,
    presentationSlideCount: presSlideCount,
    mediaCount: Object.keys(zip.files).filter(function(f) { return f.startsWith("ppt/media/"); }).length,
    layoutCount: Object.keys(zip.files).filter(function(f) { return f.startsWith("ppt/slideLayouts/") && f.endsWith(".xml"); }).length,
    masterCount: Object.keys(zip.files).filter(function(f) { return f.startsWith("ppt/slideMasters/") && f.endsWith(".xml"); }).length,
    themeCount: Object.keys(zip.files).filter(function(f) { return f.startsWith("ppt/theme/") && f.endsWith(".xml"); }).length,
  };

  if (slideFiles.length !== presSlideCount) {
    report.errors.push("Slide count mismatch: " + slideFiles.length + " files vs " + presSlideCount + " in presentation.xml");
  }

  logger.log("[VAL] Structure: " + slideFiles.length + " slides, " + report.structure.mediaCount + " media files");
}

// ═══════════════════════════════════════════════════════════
//  2. Content Type Validation
// ═══════════════════════════════════════════════════════════

async function validateContentTypes(zip, report, logger) {
  var ctEntry = zip.file("[Content_Types].xml");
  if (!ctEntry) {
    report.errors.push("Missing [Content_Types].xml");
    return;
  }
  var ctText = await ctEntry.async("text");

  // Find all media extensions in the PPTX
  var mediaExtensions = {};
  Object.keys(zip.files).forEach(function(path) {
    if (path.startsWith("ppt/media/")) {
      var ext = path.split(".").pop().toLowerCase();
      if (ext) mediaExtensions[ext] = true;
    }
  });

  var missingDefaults = [];
  Object.keys(mediaExtensions).forEach(function(ext) {
    if (ctText.indexOf('Extension="' + ext + '"') === -1) {
      missingDefaults.push(ext);
    }
  });

  report.contentTypes.defaults = (ctText.match(/<Default /g) || []).length;
  report.contentTypes.missing = missingDefaults;

  if (missingDefaults.length > 0) {
    report.errors.push("Missing content type defaults for: " + missingDefaults.join(", "));
    logger.log("[VAL] CONTENT_TYPE_WARN: missing defaults for " + missingDefaults.join(", "));
  }
}

// ═══════════════════════════════════════════════════════════
//  3. Per-Slide Validation
// ═══════════════════════════════════════════════════════════

async function validateSlides(zip, parser, report, logger) {
  var slideFiles = Object.keys(zip.files).filter(function(f) {
    return /^ppt\/slides\/slide\d+\.xml$/.test(f);
  }).sort();

  for (var i = 0; i < slideFiles.length; i++) {
    var slidePath = slideFiles[i];
    var slideText = await zip.file(slidePath).async("text");
    var slideNum = i + 1;

    // Count elements
    var spCount = (slideText.match(/<p:sp[\s>]/g) || []).length;
    var picCount = (slideText.match(/<p:pic[\s>]/g) || []).length;
    var textCount = (slideText.match(/<a:t[\s>]/g) || []).length;
    var chartCount = (slideText.match(/<p:graphicFrame[\s>]/g) || []).length;

    report.editability.shapes += spCount;
    report.editability.images += picCount;
    report.editability.textRuns += textCount;

    // Check if it's a placeholder slide
    var isPlaceholder = slideText.indexOf("PlaceholderTitle") !== -1 || slideText.indexOf("Placeholder") !== -1;

    // Find all r:embed and r:link references
    var embedMatches = slideText.match(/r:embed="rId\d+"/g) || [];
    var linkMatches = slideText.match(/r:link="rId\d+"/g) || [];

    var slideReport = {
      slideNum: slideNum,
      path: slidePath,
      shapes: spCount,
      images: picCount,
      textRuns: textCount,
      charts: chartCount,
      embedRefs: embedMatches.length,
      linkRefs: linkMatches.length,
      isPlaceholder: isPlaceholder,
      mediaChecks: [],
    };

    // Check each embed/link resolves to a file
    var relPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
    var relEntry = zip.file(relPath);
    if (relEntry && embedMatches.length > 0) {
      var relText = await relEntry.async("text");
      var embedIds = embedMatches.map(function(m) { return m.match(/r:embed="(rId\d+)"/)[1]; });

      for (var j = 0; j < embedIds.length; j++) {
        var rId = embedIds[j];
        var targetMatch = relText.match(new RegExp('Id="' + rId + '"[^>]*Target="([^"]+)"'));
        if (targetMatch) {
          var target = targetMatch[1];
          var resolved = resolveMediaPath(target, slidePath);
          var exists = !!zip.file(resolved);
          report.media.total++;
          if (!exists) {
            report.media.missing++;
            report.media.broken.push({ slide: slideNum, rId: rId, target: target, resolved: resolved });
          }
          slideReport.mediaChecks.push({ rId: rId, target: target, resolved: resolved, exists: exists });
        }
      }
    }

    report.slides.push(slideReport);
  }

  logger.log("[VAL] Validated " + slideFiles.length + " slide(s)");
}

// ═══════════════════════════════════════════════════════════
//  4. Relationship Cross-Reference
// ═══════════════════════════════════════════════════════════

async function validateRelationships(zip, parser, report, logger) {
  var relFiles = Object.keys(zip.files).filter(function(f) { return f.endsWith(".rels"); });

  for (var i = 0; i < relFiles.length; i++) {
    var relPath = relFiles[i];
    var relText = await zip.file(relPath).async("text");
    var relDoc = parser.parse(relText);
    var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
    if (!rels) continue;
    if (!Array.isArray(rels)) rels = [rels];

    for (var j = 0; j < rels.length; j++) {
      var r = rels[j];
      var target = r["@_Target"] || "";
      if (target.startsWith("http://") || target.startsWith("https://")) continue;

      report.relationships.total++;
      var resolved = resolveRelPath(target, relPath);
      if (!zip.file(resolved)) {
        // May be a directory or external reference — check if it's a URL
        report.relationships.broken.push({ relFile: relPath, rId: r["@_Id"], target: target, resolved: resolved, type: r["@_Type"] });
      }
    }
  }

  if (report.relationships.broken.length > 0) {
    logger.log("[VAL] BROKEN_RELS: " + report.relationships.broken.length + " broken relationship(s)");
    report.relationships.broken.forEach(function(b) {
      logger.log("[VAL]   " + b.relFile + " -> " + b.resolved + " (" + b.rId + ")");
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

function resolveMediaPath(target, slidePath) {
  var baseDir = slidePath.substring(0, slidePath.lastIndexOf("/") + 1);
  return resolveRelPath(target, baseDir);
}

function resolveRelPath(target, basePath) {
  if (target.startsWith("../")) {
    var baseParts = basePath.replace(/\/$/, "").split("/");
    var targetParts = target.split("/");
    var resultParts = baseParts.slice();
    for (var i = 0; i < targetParts.length; i++) {
      if (targetParts[i] === "..") { resultParts.pop(); }
      else if (targetParts[i] !== ".") { resultParts.push(targetParts[i]); }
    }
    return resultParts.join("/");
  } else if (target.startsWith("/")) {
    return target.substring(1);
  }
  return target;
}
