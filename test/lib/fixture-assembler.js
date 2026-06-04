// ═══════════════════════════════════════════════════════════
//  Fixture Assembler — Local PPTX assembly from canonical fixtures
//  Zero Google auth. Uses same production pipeline:
//    copySlideWithDependencies → buildPresentationXml →
//    ensureContentTypeDefaults → validatePptx
// ═══════════════════════════════════════════════════════════

import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { copySlideWithDependencies } from "../../api/google/pptx-slide-copy.js";
import {
  createTargetPptx,
  generatePptxBuffer,
  updateContentTypes,
  ensureContentTypeDefaults,
} from "../../api/google/pptx-slide-ops.js";
import { validatePptx } from "../../api/google/pptx-validator.js";

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };
var parser = new XMLParser(XML_OPTS);

var FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/canonical");

// ═══════════════════════════════════════════════════════════
//  Build presentation.xml (slide order list)
//  (same logic as pptx-assembler.js — replicated here to
//   avoid modifying production code)
// ═══════════════════════════════════════════════════════════

function buildPresentationXml(zip, slideEntries) {
  var sldIdEntries = slideEntries.map(function(e) {
    return '<p:sldId id="' + e.sldId + '" r:id="' + e.rId + '"/>';
  }).join("\n    ");

  var presXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:sldIdLst>\n    ' + sldIdEntries + '\n  </p:sldIdLst>\n' +
    '  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>\n' +
    '  <p:notesSz cx="6858000" cy="9144000"/>\n' +
    '  <p:defaultTextStyle/>\n' +
    '</p:presentation>';

  zip.file("ppt/presentation.xml", presXml);
}

// ═══════════════════════════════════════════════════════════
//  Build presentation.xml.rels (slide relationships)
// ═══════════════════════════════════════════════════════════

function buildPresentationRels(zip, slideEntries) {
  var slideRels = slideEntries.map(function(e) {
    return '<Relationship Id="' + e.rId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + e.slideNum + '.xml"/>';
  }).join("\n  ");

  var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  ' + slideRels + '\n' +
    '  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>\n' +
    '  <Relationship Id="rId101" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>\n' +
    '</Relationships>';

  zip.file("ppt/_rels/presentation.xml.rels", relsXml);
}

// ═══════════════════════════════════════════════════════════
//  Local Fixture Assembly
//  Loads canonical PPTX files from test/fixtures/canonical/
//  and assembles them into a single target PPTX.
// ═══════════════════════════════════════════════════════════

export async function assembleFromFixtures(moduleNames, logger) {
  logger = logger || { log: function() {} };

  logger.log("[FIX] === LOCAL FIXTURE ASSEMBLY ===");
  logger.log("[FIX] Modules: [" + moduleNames.join(", ") + "]");
  logger.log("[FIX] Fixture dir: " + FIXTURES_DIR);

  // 1. Load each fixture PPTX
  var fixtureZips = [];
  for (var i = 0; i < moduleNames.length; i++) {
    var mod = moduleNames[i];
    var fixtureName = "canonical_" + mod + ".pptx";
    var fixturePath = join(FIXTURES_DIR, fixtureName);

    try {
      var buf = readFileSync(fixturePath);
      var zip = await JSZip.loadAsync(buf);
      fixtureZips.push({ module: mod, name: fixtureName, zip: zip });
      logger.log("[FIX] Loaded fixture: " + fixtureName + " (" + buf.length + " bytes)");
    } catch (err) {
      logger.log("[FIX] ERROR: Cannot load fixture: " + fixturePath);
      logger.log("[FIX]   " + (err.message || err));
      throw new Error("Fixture not found: " + fixtureName + " — place it in test/fixtures/canonical/");
    }
  }

  // 2. Create target PPTX
  var targetZip = createTargetPptx();
  var slideCount = 0;
  var slideEntries = [];

  // 3. Copy each fixture slide into target
  for (var si = 0; si < fixtureZips.length; si++) {
    var fixture = fixtureZips[si];
    slideCount++;
    var slideNum = slideCount;
    var sldId = 255 + slideNum;
    var rId = "rId" + slideNum;

    try {
      var result = await copySlideWithDependencies(
        targetZip,
        fixture.zip,
        "ppt/slides/slide1.xml",
        slideNum,
        logger
      );
      logger.log("[FIX] Slide " + slideNum + ": " + fixture.name +
        " (" + result.copied + " parts, " + result.missing + " missing)");
      if (result.missing > 0) {
        logger.log("[FIX]   Missing parts: " + (result.missingList || []).join(", "));
      }
    } catch (cerr) {
      logger.log("[FIX] Slide " + slideNum + ": copy failed — " + (cerr.message || String(cerr)));
      throw cerr;
    }

    slideEntries.push({ slideNum: slideNum, sldId: sldId, rId: rId });
  }

  // 4. Build presentation.xml with all slides
  buildPresentationXml(targetZip, slideEntries);

  // 5. Build presentation.xml.rels
  buildPresentationRels(targetZip, slideEntries);

  // 6. Update content types for all slide overrides
  await updateContentTypes(targetZip, slideCount);

  // 7. Ensure content type defaults for all media extensions
  await ensureContentTypeDefaults(targetZip, logger);

  // 8. Generate buffer
  logger.log("[FIX] Generating final PPTX with " + slideCount + " slide(s)");
  var buffer = await generatePptxBuffer(targetZip);
  logger.log("[FIX] Generated: " + buffer.length + " bytes (" + Math.round(buffer.length / 1024) + " KB)");

  // 9. Validate
  logger.log("[FIX] Running post-assembly validation...");
  var validationReport = await validatePptx(buffer, logger);

  return {
    ok: true,
    slideCount: slideCount,
    buffer: buffer,
    sizeBytes: buffer.length,
    validation: validationReport,
    fixtureZips: fixtureZips.map(function(f) { return f.name; }),
  };
}
