// ═══════════════════════════════════════════════════════════
//  Local PPTX Engine Test — Zero network, zero auth
//  Tests the assembly + validation pipeline locally using
//  either real canonical fixtures OR synthetic test PPTX files.
//
//  This validates:
//    - copySlideWithDependencies (transitive copy)
//    - ensureContentTypeDefaults (dynamic injection)
//    - validatePptx (structure, rels, media, content types)
//
//  Usage:
//    node scripts/test-local.js              # with real fixtures
//    node scripts/test-local.js --synthetic  # with generated test PPTX
// ═══════════════════════════════════════════════════════════

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { copySlideWithDependencies } from "../api/google/pptx-slide-copy.js";
import {
  createTargetPptx,
  generatePptxBuffer,
  updateContentTypes,
  ensureContentTypeDefaults,
} from "../api/google/pptx-slide-ops.js";
import { validatePptx } from "../api/google/pptx-validator.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var ROOT = join(__dirname, "..");
var FIXTURES_DIR = join(ROOT, "test/fixtures/canonical");
var SYNTHETIC_DIR = join(ROOT, "test/fixtures/synthetic");

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };
var parser = new XMLParser(XML_OPTS);
var USE_SYNTHETIC = process.argv.includes("--synthetic");

// ═══════════════════════════════════════════════════════════
//  Colors
// ═══════════════════════════════════════════════════════════

var C = process.stdout.isTTY ? {
  red: (s) => "\x1b[31m" + s + "\x1b[0m",
  green: (s) => "\x1b[32m" + s + "\x1b[0m",
  yellow: (s) => "\x1b[33m" + s + "\x1b[0m",
  cyan: (s) => "\x1b[36m" + s + "\x1b[0m",
  bold: (s) => "\x1b[1m" + s + "\x1b[0m",
  dim: (s) => "\x1b[2m" + s + "\x1b[0m",
} : { red: (s)=>s, green: (s)=>s, yellow: (s)=>s, cyan: (s)=>s, bold: (s)=>s, dim: (s)=>s };

function log(label, msg) {
  console.log(C.dim(new Date().toISOString().replace("T"," ").substring(0,19)) + " " + C.cyan(label) + " " + msg);
}

function divider(title) {
  console.log("\n" + C.bold(C.cyan("══════════════════════════════════════════════════════════════")));
  console.log(C.bold(C.cyan("  " + title)));
  console.log(C.bold(C.cyan("══════════════════════════════════════════════════════════════")) + "\n");
}

// ═══════════════════════════════════════════════════════════
//  Logger
// ═══════════════════════════════════════════════════════════

function createLogger() {
  var logs = [];
  return {
    log: function(msg) {
      logs.push(msg);
      console.log(C.dim("  [LOG] ") + msg);
    },
    getLogs: function() { return logs; },
  };
}

// ═══════════════════════════════════════════════════════════
//  Build presentation.xml
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
//  Build presentation.xml.rels
// ╕══════════════════════════════════════════════════════════

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
//  Synthetic PPTX Generator
//  Creates a minimal PPTX with media files to exercise the
//  content-type validation path.
// ═══════════════════════════════════════════════════════════

async function createSyntheticPptx(name, mediaExts) {
  var zip = new JSZip();

  // [Content_Types].xml — intentionally MISSING media defaults
  // This simulates the bug condition.
  zip.file("[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    '  <Default Extension="xml" ContentType="application/xml"/>\n' +
    '  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>\n' +
    '  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>\n' +
    '  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n' +
    '  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>\n' +
    '  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>\n' +
    '</Types>');

  zip.file("_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n' +
    '</Relationships>');

  // Slide with image references
  var imageXml = mediaExts.map(function(ext, i) {
    var rId = "rId" + (10 + i);
    return '      <p:pic><p:nvPicPr><p:cNvPr id="' + (i + 2) + '" name="Picture ' + (i + 1) + '"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="' + (i * 1000000) + '" y="0"/><a:ext cx="1000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }).join("\n");

  var relsXml = mediaExts.map(function(ext, i) {
    var rId = "rId" + (10 + i);
    return '<Relationship Id="' + rId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + (i + 1) + '.' + ext + '"/>';
  }).join("\n");

  var slideXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
    imageXml + '\n' +
    '    </p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
    '</p:sld>';

  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/slides/_rels/slide1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    relsXml + '\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n' +
    '</Relationships>');

  // Media files (1px transparent PNG data for each)
  mediaExts.forEach(function(ext, i) {
    var fakeData = Buffer.from("FAKE_" + ext.toUpperCase() + "_DATA_" + i);
    zip.file("ppt/media/image" + (i + 1) + "." + ext, fakeData);
  });

  // Layout
  zip.file("ppt/slideLayouts/slideLayout1.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">\n' +
    '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n' +
    '  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n' +
    '</p:sldLayout>');
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>');

  // Master
  zip.file("ppt/slideMasters/slideMaster1.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n' +
    '  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n' +
    '  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>\n' +
    '</p:sldMaster>');
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>');

  // Theme
  zip.file("ppt/theme/theme1.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test Theme">\n' +
    '  <a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements>\n' +
    '</a:theme>');

  var buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return buf;
}

// ═══════════════════════════════════════════════════════════
//  Main Assembly + Validation Pipeline
// ═══════════════════════════════════════════════════════════

async function runTest(fixtureNames) {
  divider("LOCAL PPTX ENGINE TEST");
  console.log("Mode: " + (USE_SYNTHETIC ? C.yellow("SYNTHETIC fixtures") : C.yellow("REAL fixtures")));
  console.log("Modules: [" + fixtureNames.join(", ") + "]");
  console.log("");

  var logger = createLogger();

  // ── Load or create fixture PPTX files ───────────────────
  var fixtureZips = [];
  for (var i = 0; i < fixtureNames.length; i++) {
    var mod = fixtureNames[i];
    var fixtureName = "canonical_" + mod + ".pptx";
    var fixturePath = join(USE_SYNTHETIC ? SYNTHETIC_DIR : FIXTURES_DIR, fixtureName);

    var buf;
    if (USE_SYNTHETIC) {
      // Create synthetic PPTX with mixed media extensions
      var mediaExts = i === 0 ? ["png", "jpg"] : i === 1 ? ["png", "svg"] : ["jpg", "jpeg", "gif"];
      log("SYNTH", "Creating " + fixtureName + " with media: [" + mediaExts.join(", ") + "]");
      buf = await createSyntheticPptx(fixtureName, mediaExts);
      // Save for inspection
      if (!existsSync(SYNTHETIC_DIR)) mkdirSync(SYNTHETIC_DIR, { recursive: true });
      writeFileSync(fixturePath, buf);
      log("SYNTH", "Saved to " + fixturePath + " (" + buf.length + " bytes)");
    } else {
      if (!existsSync(fixturePath)) {
        console.error(C.red("ERROR: Fixture not found: " + fixturePath));
        console.error("");
        console.error("Download these 3 files from Drive and place them in test/fixtures/canonical/:");
        console.error(C.cyan("  canonical_why_brinc.pptx"));
        console.error(C.cyan("  canonical_gcc_impact.pptx"));
        console.error(C.cyan("  canonical_global_network.pptx"));
        console.error("");
        console.error("Or run with --synthetic to use generated test files:");
        console.error(C.cyan("  node scripts/test-local.js --synthetic"));
        process.exit(1);
      }
      buf = readFileSync(fixturePath);
      log("LOAD", fixtureName + " (" + buf.length + " bytes)");
    }

    var zip = await JSZip.loadAsync(buf);
    fixtureZips.push({ module: mod, name: fixtureName, zip: zip });
  }

  // ── Create target PPTX ──────────────────────────────────
  divider("ASSEMBLY");
  var targetZip = createTargetPptx();
  var slideCount = 0;
  var slideEntries = [];

  for (var si = 0; si < fixtureZips.length; si++) {
    var fixture = fixtureZips[si];
    slideCount++;
    var slideNum = slideCount;
    var sldId = 255 + slideNum;
    var rId = "rId" + slideNum;

    log("ASM", "Copying slide " + slideNum + ": " + fixture.name);
    var result = await copySlideWithDependencies(
      targetZip, fixture.zip,
      "ppt/slides/slide1.xml", slideNum, logger
    );
    log("ASM", "  copied=" + result.copied + " missing=" + result.missing);
    if (result.missing > 0) {
      log("ASM", "  missingList: " + (result.missingList || []).join(", "));
    }

    slideEntries.push({ slideNum: slideNum, sldId: sldId, rId: rId });
  }

  // ── Build presentation.xml + rels ───────────────────────
  buildPresentationXml(targetZip, slideEntries);
  buildPresentationRels(targetZip, slideEntries);

  // ── Content types ────────────────────────────────────────
  divider("CONTENT TYPES");
  await updateContentTypes(targetZip, slideCount);
  log("CT", "Updated slide overrides");

  // This is the critical step being tested
  await ensureContentTypeDefaults(targetZip, logger);

  // ── Generate buffer ──────────────────────────────────────
  divider("GENERATE");
  var buffer = await generatePptxBuffer(targetZip);
  log("GEN", buffer.length + " bytes (" + Math.round(buffer.length / 1024) + " KB)");

  // ── Validate ─────────────────────────────────────────────
  divider("VALIDATION");
  var validation = await validatePptx(buffer, logger);

  // ── Results ──────────────────────────────────────────────
  divider("RESULTS");

  var pass = validation.ok === true;
  var mediaMissingZero = validation.media.missing === 0;
  var brokenZero = validation.relationships.broken.length === 0;
  var errorsZero = validation.errors.length === 0;
  var renderCriticalZero = (validation.relationships.renderCriticalCount || 0) === 0;

  console.log(C.bold("PASS:              ") + (pass ? C.green("true ✓") : C.red("false ✗")));
  console.log(C.bold("xmlPass:           ") + (validation.ok ? C.green("true ✓") : C.red("false ✗")));
  console.log(C.bold("errorsZero:        ") + (errorsZero ? C.green("true ✓") : C.red("false ✗")));
  console.log(C.bold("mediaMissing:      ") + (mediaMissingZero ? C.green("0 ✓") : C.red(validation.media.missing)));
  console.log(C.bold("relationshipsBroken: ") + (brokenZero ? C.green("0 ✓") : C.red(validation.relationships.broken.length)));
  console.log(C.bold("renderCritical:    ") + (renderCriticalZero ? C.green("0 ✓") : C.red(validation.relationships.renderCriticalCount)));
  console.log("");

  // Validation errors
  if (validation.errors.length > 0) {
    console.log(C.bold(C.red("Validation Errors (" + validation.errors.length + "):")));
    validation.errors.forEach(function(e, i) {
      console.log(C.red("  " + (i+1) + ". " + e));
    });
    console.log("");
  }

  // Content types summary
  if (validation.contentTypes) {
    console.log(C.bold(C.cyan("Content Types:")));
    console.log("  defaults: " + validation.contentTypes.defaults);
    console.log("  missing:  " + JSON.stringify(validation.contentTypes.missing));
    console.log("");
  }

  // Slide summary
  console.log(C.bold(C.cyan("Slides:")));
  console.log("  count:     " + validation.structure.slideCount);
  console.log("  shapes:    " + validation.editability.shapes);
  console.log("  images:    " + validation.editability.images);
  console.log("  textRuns:  " + validation.editability.textRuns);
  console.log("  media:     " + validation.media.total);
  console.log("");

  // ── Final verdict ────────────────────────────────────────
  divider("VERDICT");

  var allPass = pass && mediaMissingZero && brokenZero && errorsZero && renderCriticalZero;

  if (allPass) {
    console.log(C.bold(C.green("══════════════════════════════════════════════════════════════")));
    console.log(C.bold(C.green("  ALL CRITERIA MET")));
    console.log(C.bold(C.green("══════════════════════════════════════════════════════════════")));
    console.log("");
    console.log("PASS:              true");
    console.log("xmlPass:           true");
    console.log("errorsZero:        true");
    console.log("mediaMissing:      0");
    console.log("relationshipsBroken: 0");
    console.log("renderCritical:    0");
    process.exit(0);
  } else {
    console.log(C.bold(C.red("══════════════════════════════════════════════════════════════")));
    console.log(C.bold(C.red("  FAILING CONDITIONS:")));
    console.log(C.bold(C.red("══════════════════════════════════════════════════════════════")));
    if (!pass)            console.log(C.red("  • PASS = false"));
    if (!validation.ok)   console.log(C.red("  • xmlPass = false (validation.ok = false)"));
    if (!errorsZero)      console.log(C.red("  • errorsZero = false (" + validation.errors.length + " errors)"));
    if (!mediaMissingZero) console.log(C.red("  • mediaMissing = " + validation.media.missing));
    if (!brokenZero)       console.log(C.red("  • relationshipsBroken = " + validation.relationships.broken.length));
    if (!renderCriticalZero) console.log(C.red("  • renderCritical = " + validation.relationships.renderCriticalCount));
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════
//  Run
// ═══════════════════════════════════════════════════════════

var TEST_MODULES = ["why_brinc", "gcc_impact", "global_network"];

runTest(TEST_MODULES).catch(function(err) {
  console.error(C.red("FATAL: ") + (err.message || err));
  console.error(err.stack);
  process.exit(1);
});
