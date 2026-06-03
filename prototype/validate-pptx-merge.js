#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
//  PPTX SLIDE MERGE VALIDATION PROTOTYPE
//  Isolated proof-of-concept for PPTX-first rendering
//
//  Usage:
//    node validate-pptx-merge.js <path-to-source.pptx> [slideIndex]
//
//  Or with Google Drive download:
//    ACCESS_TOKEN=xxx FILE_ID=xxx node validate-pptx-merge.js
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

// ── Config ────────────────────────────────────────────────

var SOURCE_PATH = process.argv[2];
var SLIDE_INDEX = parseInt(process.argv[3] || "0", 10);
var OUTPUT_DIR = path.join(__dirname, "output");
var ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
var FILE_ID = process.env.FILE_ID || "";

// XML parse options (preserve order, attributes, namespaces)
var XML_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
  htmlEntities: true,
};

var parser = new XMLParser(XML_OPTS);
var builder = new XMLBuilder(XML_OPTS);

// ── Logger ────────────────────────────────────────────────

var logs = [];
function log(msg) {
  var line = "[PPTX-VAL] " + msg;
  logs.push(line);
  console.log(line);
}

// ── Helpers ───────────────────────────────────────────────

async function readXml(zip, filePath) {
  var entry = zip.file(filePath);
  if (!entry) return null;
  var xmlStr = await entry.async("text");
  return { text: xmlStr, doc: parser.parse(xmlStr) };
}

function writeXml(zip, filePath, doc) {
  var xmlStr = builder.build(doc);
  // Ensure XML declaration
  if (!xmlStr.startsWith("<?xml")) {
    xmlStr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xmlStr;
  }
  zip.file(filePath, xmlStr);
}

function listZipFiles(zip) {
  return Object.keys(zip.files).sort();
}

function findFiles(zip, pattern) {
  return listZipFiles(zip).filter(function(f) { return pattern.test(f); });
}

// Extract numeric suffix from filename (e.g., "slide3.xml" → 3)
function fileNumber(filename) {
  var m = filename.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ── Drive Download ────────────────────────────────────────

function downloadFromDrive(fileId, token) {
  log("Downloading from Drive: fileId=" + fileId.substring(0, 12) + "...");
  return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) {
    log("Drive download HTTP status: " + r.status);
    if (!r.ok) throw new Error("Drive download failed: HTTP " + r.status);
    return r.arrayBuffer();
  });
}

// ── PPTX Inspector ────────────────────────────────────────

async function inspectPptx(zip, label) {
  log("=== INSPECTING: " + label + " ===");
  var files = listZipFiles(zip);
  log("Total files: " + files.length);

  // Core structure files
  var contentTypes = zip.file("[Content_Types].xml");
  var presentation = zip.file("ppt/presentation.xml");
  log("[Content_Types].xml: " + (contentTypes ? "present" : "MISSING"));
  log("ppt/presentation.xml: " + (presentation ? "present" : "MISSING"));

  // Slides
  var slides = findFiles(zip, /ppt\/slides\/slide\d+\.xml/);
  log("Slides: " + slides.length + " -> [" + slides.join(", ") + "]");

  // Slide layouts
  var layouts = findFiles(zip, /ppt\/slideLayouts\/slideLayout\d+\.xml/);
  log("Slide layouts: " + layouts.length);

  // Slide masters
  var masters = findFiles(zip, /ppt\/slideMasters\/slideMaster\d+\.xml/);
  log("Slide masters: " + masters.length);

  // Media
  var media = findFiles(zip, /ppt\/media\//);
  log("Media files: " + media.length + " -> [" + media.join(", ") + "]");

  // Theme
  var themes = findFiles(zip, /ppt\/theme\/theme\d+\.xml/);
  log("Themes: " + themes.length);

  // Relationships
  var rels = findFiles(zip, /_rels\//);
  log("Relationship files: " + rels.length + " -> [" + rels.join(", ") + "]");

  // Parse presentation.xml to get slide order
  if (presentation) {
    var presXml = await readXml(zip, "ppt/presentation.xml");
    if (presXml && presXml.doc) {
      var sldIdLst = presXml.doc["p:presentation"] && presXml.doc["p:presentation"]["p:sldIdLst"];
      if (sldIdLst && sldIdLst["p:sldId"]) {
        var sldArr = Array.isArray(sldIdLst["p:sldId"]) ? sldIdLst["p:sldId"] : [sldIdLst["p:sldId"]];
        log("Slide order in presentation: " + sldArr.length + " slides");
        sldArr.forEach(function(s, i) {
          log("  [" + i + "] id=" + (s["@_id"] || "?") + " -> " + (s["@_r:id"] || "?"));
        });
      }
    }
  }

  return { slides: slides, media: media, layouts: layouts, masters: masters, themes: themes, rels: rels };
}

// ── XML Tree Walkers (nested object format) ───────────────

function walkDoc(obj, fn) {
  if (!obj || typeof obj !== "object") return;
  fn(obj);
  Object.keys(obj).forEach(function(key) {
    if (key.startsWith("@_")) return;
    var val = obj[key];
    if (Array.isArray(val)) {
      val.forEach(function(item) { walkDoc(item, fn); });
    } else if (typeof val === "object") {
      walkDoc(val, fn);
    }
  });
}

function findInDoc(obj, tagName) {
  var results = [];
  walkDoc(obj, function(node) {
    if (node[tagName] !== undefined) results.push(node[tagName]);
  });
  return results;
}

function findFirstInDoc(obj, tagName) {
  var results = findInDoc(obj, tagName);
  return results.length > 0 ? results[0] : null;
}

function getAttr(doc, tagName, attrName) {
  var found = findFirstInDoc(doc, tagName);
  if (found && found["@_" + attrName] !== undefined) return found["@_" + attrName];
  // Also check if it's an array
  if (found && Array.isArray(found) && found[0] && found[0]["@_" + attrName] !== undefined) {
    return found[0]["@_" + attrName];
  }
  return null;
}

// ── Slide Extractor ───────────────────────────────────────

async function extractSlideData(sourceZip, slideIndex) {
  log("=== EXTRACTING SLIDE [" + slideIndex + "] ===");

  // 1. Read presentation.xml to find slide relationship
  var presData = await readXml(sourceZip, "ppt/presentation.xml");
  if (!presData) throw new Error("Cannot read presentation.xml");

  // Find sldIdLst and get the slide's rId
  var sldIdLst = findFirstInDoc(presData.doc, "p:sldIdLst");
  if (!sldIdLst) throw new Error("No sldIdLst found in presentation");

  // p:sldIdLst -> { "p:sldId": [ {slide1}, {slide2}, ... ] }
  var sldIdEntries = sldIdLst["p:sldId"] || [];
  if (!Array.isArray(sldIdEntries)) sldIdEntries = [sldIdEntries];
  log("Found " + sldIdEntries.length + " slide ID(s) in presentation");

  if (slideIndex >= sldIdEntries.length) {
    throw new Error("Slide index " + slideIndex + " out of range (0-" + (sldIdEntries.length - 1) + ")");
  }

  var targetSldId = sldIdEntries[slideIndex];
  var slideRId = targetSldId["@_r:id"];
  var slideInternalId = targetSldId["@_id"];
  log("Slide " + slideIndex + ": internalId=" + slideInternalId + " rId=" + slideRId);

  // 2. Resolve rId to actual file path via presentation_rels
  var presRelsData = await readXml(sourceZip, "ppt/_rels/presentation.xml.rels");
  if (!presRelsData) throw new Error("Cannot read presentation.xml.rels");

  var slideFilePath = null;
  var rels = presRelsData.doc["Relationships"] && presRelsData.doc["Relationships"]["Relationship"];
  if (!rels) throw new Error("No relationships found in presentation.xml.rels");
  if (!Array.isArray(rels)) rels = [rels];
  for (var ri = 0; ri < rels.length; ri++) {
    if (rels[ri]["@_Id"] === slideRId) {
      slideFilePath = "ppt/" + rels[ri]["@_Target"];
      break;
    }
  }

  if (!slideFilePath) throw new Error("Cannot resolve slide rId=" + slideRId + " to file path");
  log("Slide file: " + slideFilePath);

  // 3. Read slide XML
  var slideData = await readXml(sourceZip, slideFilePath);
  if (!slideData) throw new Error("Cannot read slide file: " + slideFilePath);
  log("Slide XML size: " + slideData.text.length + " chars");

  // 4. Count elements in slide (use direct access to spTree to avoid walkDoc double-count)
  var spTree = slideData.doc["p:sld"] && slideData.doc["p:sld"]["p:cSld"] && slideData.doc["p:sld"]["p:cSld"]["p:spTree"];
  var elements = spTree ? (spTree["p:sp"] || []).concat(spTree["p:pic"] || [], spTree["p:cxnSp"] || [], spTree["p:graphicFrame"] || []) : [];
  if (!Array.isArray(elements)) elements = elements ? [elements] : [];
  // Flatten in case individual arrays were not arrays
  var flatElements = [];
  [spTree["p:sp"], spTree["p:pic"], spTree["p:cxnSp"], spTree["p:graphicFrame"]].forEach(function(arr) {
    if (!arr) return;
    if (Array.isArray(arr)) flatElements = flatElements.concat(arr);
    else flatElements.push(arr);
  });
  var shapeCount = spTree && spTree["p:sp"] ? (Array.isArray(spTree["p:sp"]) ? spTree["p:sp"].length : 1) : 0;
  var imageCount = spTree && spTree["p:pic"] ? (Array.isArray(spTree["p:pic"]) ? spTree["p:pic"].length : 1) : 0;
  log("Slide elements: " + flatElements.length + " (shapes=" + shapeCount + " images=" + imageCount + ")");

  // 5. Read slide's own .rels file
  var slideRelPath = slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
  var slideRelsData = await readXml(sourceZip, slideRelPath);
  if (slideRelsData) {
    log("Slide rels: " + slideRelPath);
    var slideRels = [];
    var relArr = slideRelsData.doc["Relationships"] && slideRelsData.doc["Relationships"]["Relationship"];
    if (relArr) {
      if (!Array.isArray(relArr)) relArr = [relArr];
      relArr.forEach(function(r) {
        slideRels.push({ id: r["@_Id"], type: r["@_Type"], target: r["@_Target"] });
      });
    }
    log("  Relationships: " + slideRels.length);
    slideRels.forEach(function(r) {
      log("    " + r.id + " -> " + r.target + " (" + r.type.split("/").pop() + ")");
    });
  }

  return {
    slideIndex: slideIndex,
    slideInternalId: slideInternalId,
    slideRId: slideRId,
    slideFilePath: slideFilePath,
    slideXml: slideData,
    slideRels: slideRelsData,
  };
}

// ── Target PPTX Creator ───────────────────────────────────

function createMinimalTarget() {
  log("=== CREATING MINIMAL TARGET PPTX ===");
  var zip = new JSZip();

  // [Content_Types].xml
  var ctXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    '  <Default Extension="xml" ContentType="application/xml"/>\n' +
    '  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>\n' +
    '  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>\n' +
    '  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n' +
    '  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>\n' +
    '  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>\n' +
    '  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>\n' +
    '  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>\n' +
    '</Types>';
  zip.file("[Content_Types].xml", ctXml);

  // _rels/.rels
  var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n' +
    '</Relationships>';
  zip.file("_rels/.rels", rootRels);

  // A minimal blank slide
  var blankSlide = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:cSld><p:spTree>\n' +
    '    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
    '    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
    '  </p:spTree></p:cSld>\n' +
    '  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
    '</p:sld>';
  zip.file("ppt/slides/slide1.xml", blankSlide);
  zip.file("ppt/slides/_rels/slide1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n' +
    '</Relationships>');

  // Minimal slide layout
  var layoutXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">\n' +
    '  <p:cSld><p:spTree>\n' +
    '    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
    '    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
    '  </p:spTree></p:cSld>\n' +
    '  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n' +
    '</p:sldLayout>';
  zip.file("ppt/slideLayouts/slideLayout1.xml", layoutXml);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>\n' +
    '</Relationships>');

  // Minimal slide master
  var masterXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:cSld><p:spTree>\n' +
    '    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
    '    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
    '  </p:spTree></p:cSld>\n' +
    '  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n' +
    '  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>\n' +
    '</p:sldMaster>';
  zip.file("ppt/slideMasters/slideMaster1.xml", masterXml);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n' +
    '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>\n' +
    '</Relationships>');

  // Minimal theme
  var themeXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">\n' +
    '  <a:themeElements>\n' +
    '    <a:clrScheme name="Office">\n' +
    '      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>\n' +
    '      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>\n' +
    '      <a:dk2><a:srgbClr val="44546A"/></a:dk2>\n' +
    '      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>\n' +
    '      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>\n' +
    '      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>\n' +
    '      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>\n' +
    '      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>\n' +
    '      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>\n' +
    '      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>\n' +
    '      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>\n' +
    '      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>\n' +
    '    </a:clrScheme>\n' +
    '    <a:fontScheme name="Office">\n' +
    '      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>\n' +
    '      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>\n' +
    '    </a:fontScheme>\n' +
    '    <a:fmtScheme name="Office">\n' +
    '      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:noFill/></a:fillStyleLst>\n' +
    '      <a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>\n' +
    '      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst>\n' +
    '      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="205000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="205000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="25000"/><a:satMod val="205000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill></a:bgFillStyleLst>\n' +
    '    </a:fmtScheme>\n' +
    '  </a:themeElements>\n' +
    '</a:theme>';
  zip.file("ppt/theme/theme1.xml", themeXml);

  // Minimal presentation
  var presXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>\n' +
    '  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>\n' +
    '  <p:notesSz cx="6858000" cy="9144000"/>\n' +
    '  <p:defaultTextStyle/>\n' +
    '</p:presentation>';
  zip.file("ppt/presentation.xml", presXml);
  zip.file("ppt/_rels/presentation.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>\n' +
    '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>\n' +
    '  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>\n' +
    '  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>\n' +
    '  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>\n' +
    '</Relationships>');

  // presProps & viewProps (minimal)
  zip.file("ppt/presProps.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:presPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:showType p:val="present"/></p:presPr>');
  zip.file("ppt/viewProps.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620" autoAdjust="0"/><p:restoredTop sz="94660" autoAdjust="0"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="104" d="100"/><a:sy n="104" d="100"/></p:scale><p:origin x="-222" y="-90"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="720000" cy="720000"/></p:viewPr>');

  log("Minimal target PPTX structure created");
  return zip;
}

// ── Merge Logic (Naive Copy) ──────────────────────────────

async function naiveMergeSlide(targetZip, sourceZip, slideData) {
  log("=== NAIVE MERGE: copying slide XML + media ===");

  // 1. Read source slide XML text (raw, not parsed)
  var slideEntry = sourceZip.file(slideData.slideFilePath);
  var slideXmlText = await slideEntry.async("text");

  // 2. Determine target slide number (we'll add as slide2)
  var existingSlides = findFiles(targetZip, /ppt\/slides\/slide\d+\.xml/);
  var targetSlideNum = existingSlides.length + 1;
  var targetSlidePath = "ppt/slides/slide" + targetSlideNum + ".xml";
  var targetSlideRelsPath = "ppt/slides/_rels/slide" + targetSlideNum + ".xml.rels";
  log("Target slide path: " + targetSlidePath);

  // 3. Copy slide XML to target
  targetZip.file(targetSlidePath, slideXmlText);
  log("Copied slide XML: " + slideXmlText.length + " chars");

  // 4. Copy slide rels if they exist
  var sourceSlideRelsPath = slideData.slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
  var sourceRelsEntry = sourceZip.file(sourceSlideRelsPath);
  if (sourceRelsEntry) {
    var relsText = await sourceRelsEntry.async("text");
    targetZip.file(targetSlideRelsPath, relsText);
    log("Copied slide rels: " + relsText.length + " chars");

    // 5. Collect referenced media files (direct array access)
    var relsDoc = parser.parse(relsText);
    var mediaPaths = [];
    var relRoot = relsDoc["Relationships"] && relsDoc["Relationships"]["Relationship"];
    if (relRoot) {
      var relArr = Array.isArray(relRoot) ? relRoot : [relRoot];
      relArr.forEach(function(rel) {
        var relType = rel["@_Type"] || "";
        var relTarget = rel["@_Target"] || "";
        if (relType.indexOf("image") !== -1 || relType.indexOf("media") !== -1 || relType.indexOf("audio") !== -1 || relType.indexOf("video") !== -1) {
          var mediaPath;
          if (relTarget.startsWith("../")) {
            mediaPath = "ppt/" + relTarget.replace(/^\.\.\//, "");
          } else if (relTarget.startsWith("/")) {
            mediaPath = relTarget.substring(1);
          } else {
            mediaPath = "ppt/slides/" + relTarget;
          }
          mediaPaths.push(mediaPath);
        }
      });
    }

    // 6. Copy media files (async)
    var mediaCopies = 0;
    for (var mi = 0; mi < mediaPaths.length; mi++) {
      var mediaPath = mediaPaths[mi];
      var mediaEntry = sourceZip.file(mediaPath);
      if (mediaEntry) {
        var mediaBuffer = await mediaEntry.async("nodebuffer");
        targetZip.file(mediaPath, mediaBuffer);
        mediaCopies++;
        log("  Copied media: " + mediaPath + " (" + mediaBuffer.length + " bytes)");
      } else {
        log("  MISSING media: " + mediaPath + " (referenced but not found in source)");
      }
    }
    log("Total media files copied: " + mediaCopies);
  } else {
    log("No slide rels file — slide has no external references");
  }

  // 6. Update target presentation.xml to include new slide
  var presData = await readXml(targetZip, "ppt/presentation.xml");
  if (presData && presData.doc) {
    var pres = presData.doc["p:presentation"];
    var sldIdLst = pres && pres["p:sldIdLst"];
    if (sldIdLst) {
      var sldArr = sldIdLst["p:sldId"] || [];
      if (!Array.isArray(sldArr)) sldArr = [sldArr];
      var maxId = 256;
      sldArr.forEach(function(s) { var id = parseInt(s["@_id"] || "0", 10); if (id > maxId) maxId = id; });
      var newId = maxId + 1;
      var newRelId = "rId" + (10 + targetSlideNum);
      sldArr.push({ "@_id": String(newId), "@_r:id": newRelId });
      sldIdLst["p:sldId"] = sldArr;
      log("Added slide to presentation.xml: id=" + newId + " rId=" + newRelId);
    }
    writeXml(targetZip, "ppt/presentation.xml", presData.doc);
  }

  // 7. Update presentation.xml.rels
  var presRelsData = await readXml(targetZip, "ppt/_rels/presentation.xml.rels");
  if (presRelsData && presRelsData.doc) {
    var relsRoot = presRelsData.doc["Relationships"];
    var relArr = relsRoot && relsRoot["Relationship"] || [];
    if (!Array.isArray(relArr)) relArr = [relArr];
    var maxRelId = 0;
    relArr.forEach(function(r) { var num = parseInt((r["@_Id"] || "").replace("rId", ""), 10); if (num > maxRelId) maxRelId = num; });
    var newRelId = "rId" + (maxRelId + 1);
    relArr.push({
      "@_Id": newRelId,
      "@_Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
      "@_Target": "slides/slide" + targetSlideNum + ".xml"
    });
    relsRoot["Relationship"] = relArr;
    log("Added relationship: " + newRelId + " -> slides/slide" + targetSlideNum + ".xml");
    writeXml(targetZip, "ppt/_rels/presentation.xml.rels", presRelsData.doc);
  }

  // 8. Update [Content_Types].xml
  var ctEntry = targetZip.file("[Content_Types].xml");
  if (ctEntry) {
    var ctText = await ctEntry.async("text");
    var slidePartName = "/ppt/slides/slide" + targetSlideNum + ".xml";
    if (ctText.indexOf(slidePartName) === -1) {
      ctText = ctText.replace(
        '</Types>',
        '  <Override PartName="' + slidePartName + '" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n</Types>'
      );
      targetZip.file("[Content_Types].xml", ctText);
      log("Added [Content_Types] override for: " + slidePartName);
    }
  }

  log("=== NAIVE MERGE COMPLETE ===");
  return targetZip;
}

// ── Fidelity Checker ──────────────────────────────────────

async function checkFidelity(sourceZip, outputZip, slideData) {
  log("=== FIDELITY CHECK ===");

  // Compare slide XML structure
  var sourceSlideText = await sourceZip.file(slideData.slideFilePath).async("text");
  // The merged slide is slide2 in the output (slide1 was the blank placeholder)
  var outputSlidePath = "ppt/slides/slide2.xml";
  var outputSlideEntry = outputZip.file(outputSlidePath);

  if (!outputSlideEntry) {
    log("FAIL: Slide not found in output");
    return;
  }

  var outputSlideText = await outputSlideEntry.async("text");

  // Check element counts using inclusive regex
  var sourceSpMatch = sourceSlideText.match(/<p:sp[\s>]/g) || [];
  var outputSpMatch = outputSlideText.match(/<p:sp[\s>]/g) || [];
  var sourcePicMatch = sourceSlideText.match(/<p:pic[\s>]/g) || [];
  var outputPicMatch = outputSlideText.match(/<p:pic[\s>]/g) || [];
  log("Shape counts: source=" + sourceSpMatch.length + " output=" + outputSpMatch.length);
  log("Image counts: source=" + sourcePicMatch.length + " output=" + outputPicMatch.length);
  var elementsMatch = sourceSpMatch.length === outputSpMatch.length && sourcePicMatch.length === outputPicMatch.length;
  log("Element counts match: " + (elementsMatch ? "YES" : "PARTIAL"));

  // Check media files referenced by slide rels
  var slideRelsPath = slideData.slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
  var slideRelsEntry = sourceZip.file(slideRelsPath);
  if (slideRelsEntry) {
    var relsText = await slideRelsEntry.async("text");
    var relsDoc = parser.parse(relsText);
    var mediaRefs = [];
    var relRoot = relsDoc["Relationships"] && relsDoc["Relationships"]["Relationship"];
    if (relRoot) {
      var relArr = Array.isArray(relRoot) ? relRoot : [relRoot];
      relArr.forEach(function(r) {
        if ((r["@_Type"] || "").indexOf("image") !== -1) mediaRefs.push(r["@_Target"]);
      });
    }
    log("Media references: " + mediaRefs.length);
    mediaRefs.forEach(function(mref) {
      var mediaPath = mref.startsWith("../") ? "ppt/" + mref.replace(/^\.\.\//, "") : mref;
      var exists = !!outputZip.file(mediaPath);
      log("  " + mediaPath + ": " + (exists ? "PRESENT" : "MISSING"));
    });
  }

  // Check slide layout reference
  var hasLayoutRef = outputSlideText.indexOf('r:id="rId1"') !== -1 || outputSlideText.indexOf("slideLayout") !== -1;
  log("Slide layout reference: " + (hasLayoutRef ? "present" : "not detected"));

  // Check text content preserved
  var stripTags = function(s) { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); };
  var sourceText = stripTags(sourceSlideText);
  var outputText = stripTags(outputSlideText);
  var textMatch = sourceText === outputText;
  log("Text content match: " + (textMatch ? "YES" : "PARTIAL"));
  if (!textMatch) {
    log("  Source text: " + sourceText.substring(0, 120));
    log("  Output text: " + outputText.substring(0, 120));
  }

  log("=== FIDELITY CHECK COMPLETE ===");
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  log("═══════════════════════════════════════════════════════════");
  log("  PPTX SLIDE MERGE VALIDATION PROTOTYPE");
  log("═══════════════════════════════════════════════════════════");

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  var sourceBuffer;

  // Option A: Download from Drive
  if (ACCESS_TOKEN && FILE_ID) {
    log("Mode: Drive download");
    sourceBuffer = await downloadFromDrive(FILE_ID, ACCESS_TOKEN);
    fs.writeFileSync(path.join(OUTPUT_DIR, "source_downloaded.pptx"), Buffer.from(sourceBuffer));
    log("Saved downloaded source to: output/source_downloaded.pptx");
  }
  // Option B: Local file
  else if (SOURCE_PATH && fs.existsSync(SOURCE_PATH)) {
    log("Mode: Local file");
    sourceBuffer = fs.readFileSync(SOURCE_PATH);
  }
  else {
    log("ERROR: No source provided. Usage:");
    log("  node validate-pptx-merge.js <path-to-source.pptx> [slideIndex]");
    log("  ACCESS_TOKEN=xxx FILE_ID=xxx node validate-pptx-merge.js");
    process.exit(1);
  }

  log("Source PPTX size: " + sourceBuffer.byteLength + " bytes (" + Math.round(sourceBuffer.byteLength / 1024) + " KB)");

  // Load source PPTX
  var sourceZip = await JSZip.loadAsync(sourceBuffer);
  var sourceInfo = await inspectPptx(sourceZip, "SOURCE");

  if (sourceInfo.slides.length === 0) {
    log("ERROR: No slides found in source PPTX");
    process.exit(1);
  }

  if (SLIDE_INDEX >= sourceInfo.slides.length) {
    SLIDE_INDEX = 0;
    log("Adjusted slide index to 0 (only " + sourceInfo.slides.length + " slide(s) available)");
  }

  // Extract slide data
  var slideData = await extractSlideData(sourceZip, SLIDE_INDEX);

  // Create target PPTX
  var targetZip = createMinimalTarget();

  // Merge slide
  var resultZip = await naiveMergeSlide(targetZip, sourceZip, slideData);

  // Verify output
  log("=== OUTPUT STRUCTURE ===");
  var outputInfo = await inspectPptx(resultZip, "OUTPUT");

  // Fidelity check
  await checkFidelity(sourceZip, resultZip, slideData);

  // Save output
  var outputBuffer = await resultZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  var outputPath = path.join(OUTPUT_DIR, "merged_output.pptx");
  fs.writeFileSync(outputPath, outputBuffer);
  log("Saved merged output to: " + outputPath + " (" + Math.round(outputBuffer.length / 1024) + " KB)");

  // Save log
  var logPath = path.join(OUTPUT_DIR, "merge-validation.log");
  fs.writeFileSync(logPath, logs.join("\n"));
  log("Saved log to: " + logPath);

  log("═══════════════════════════════════════════════════════════");
  log("  VALIDATION COMPLETE");
  log("  Open output/merged_output.pptx in PowerPoint to verify");
  log("═══════════════════════════════════════════════════════════");
}

main().catch(function(err) {
  console.error("[PPTX-VAL] FATAL:", err);
  process.exit(1);
});
