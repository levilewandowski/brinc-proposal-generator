// ═══════════════════════════════════════════════════════════
//  PPTX Slide Operations — Low-level utilities for PPTX assembly
//  Handles: download, extract, copy media, create target, buffer generation
// ═══════════════════════════════════════════════════════════

import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import {
  resolveRelationshipTarget,
  packageUriToEntryName,
} from "./opc-resolver.js";

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };
var parser = new XMLParser(XML_OPTS);
var builder = new XMLBuilder(XML_OPTS);

// ── Drive Download ────────────────────────────────────────

export function downloadPptx(fileId, token, logger) {
  logger.log("[OPS] Downloading: " + fileId.substring(0, 12) + "...");
  return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true&includeItemsFromAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) {
    logger.log("[OPS] Download HTTP: " + r.status);
    if (!r.ok) throw new Error("Download failed: HTTP " + r.status);
    return r.arrayBuffer();
  });
}

// ── Slide XML Resolution ──────────────────────────────────

export async function readSlideXml(zip, slideIndex, logger) {
  // 1. Read presentation.xml to find slide order
  var presEntry = zip.file("ppt/presentation.xml");
  if (!presEntry) throw new Error("No presentation.xml found");
  var presText = await presEntry.async("text");
  var presDoc = parser.parse(presText);
  var sldIdLst = presDoc["p:presentation"] && presDoc["p:presentation"]["p:sldIdLst"];
  if (!sldIdLst || !sldIdLst["p:sldId"]) throw new Error("No slides in presentation");
  var sldArr = Array.isArray(sldIdLst["p:sldId"]) ? sldIdLst["p:sldId"] : [sldIdLst["p:sldId"]];
  if (slideIndex >= sldArr.length) throw new Error("Slide index " + slideIndex + " out of range (0-" + (sldArr.length - 1) + ")");

  var targetSldId = sldArr[slideIndex];
  var slideRId = targetSldId["@_r:id"];
  logger.log("[OPS] Slide " + slideIndex + ": rId=" + slideRId);

  // 2. Resolve rId to file path via presentation.xml.rels
  var presRelsEntry = zip.file("ppt/_rels/presentation.xml.rels");
  if (!presRelsEntry) throw new Error("No presentation.xml.rels found");
  var presRelsText = await presRelsEntry.async("text");
  var presRelsDoc = parser.parse(presRelsText);
  var rels = presRelsDoc["Relationships"] && presRelsDoc["Relationships"]["Relationship"];
  if (!rels) throw new Error("No relationships in presentation.xml.rels");
  if (!Array.isArray(rels)) rels = [rels];

  var slideFilePath = null;
  for (var i = 0; i < rels.length; i++) {
    if (rels[i]["@_Id"] === slideRId) {
      slideFilePath = "ppt/" + rels[i]["@_Target"];
      break;
    }
  }
  if (!slideFilePath) throw new Error("Cannot resolve slide rId=" + slideRId);
  logger.log("[OPS] Slide file: " + slideFilePath);

  // 3. Read slide XML
  var slideEntry = zip.file(slideFilePath);
  if (!slideEntry) throw new Error("Slide file not found: " + slideFilePath);
  var slideXml = await slideEntry.async("text");

  // 4. Read slide rels if they exist
  var slideRelPath = slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");
  var slideRelEntry = zip.file(slideRelPath);
  var slideRels = null;
  if (slideRelEntry) {
    slideRels = await slideRelEntry.async("text");
    logger.log("[OPS] Slide rels: " + slideRelPath + " (" + slideRels.length + " chars)");
  }

  return { slideXml: slideXml, slideRels: slideRels, slideFilePath: slideFilePath };
}

// Relationship types that reference external files needing copy
var EXTERNAL_REL_TYPES = [
  "image", "audio", "video", "chart", "diagram",
  "oleObject", "package", "slideLayout", "slideMaster", "theme",
];

function isExternalRel(relType) {
  if (!relType) return false;
  var t = relType.toLowerCase();
  for (var i = 0; i < EXTERNAL_REL_TYPES.length; i++) {
    if (t.indexOf(EXTERNAL_REL_TYPES[i]) !== -1) return true;
  }
  return false;
}

// ── Media Copy (OPC-compliant) ────────────────────────────

/**
 * Copy external file references from slide rels into target PPTX.
 * Uses OPC-compliant URI resolution (not string concatenation).
 *
 * @param targetZip       JSZip instance for output
 * @param sourceZip       JSZip instance for input
 * @param slideRelsXml    Text content of slide .rels file
 * @param sourceSlideUri  Package URI of source slide (e.g., "/ppt/slides/slide1.xml")
 * @param logger
 */
export async function copyMedia(targetZip, sourceZip, slideRelsXml, sourceSlideUri, logger) {
  if (!slideRelsXml) return { copied: 0, missing: 0, details: [] };
  var relDoc = parser.parse(slideRelsXml);
  var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
  if (!rels) return { copied: 0, missing: 0, details: [] };
  if (!Array.isArray(rels)) rels = [rels];

  var copied = 0, missing = 0, details = [];
  var sourceUri = sourceSlideUri || "/ppt/slides/slide1.xml";

  for (var i = 0; i < rels.length; i++) {
    var r = rels[i];
    var rId = r["@_Id"] || "";
    var rType = r["@_Type"] || "";
    var rTarget = r["@_Target"] || "";

    // Skip non-external references
    if (!isExternalRel(rType)) continue;
    // Skip URLs (external hyperlinks)
    if (rTarget.indexOf(":") !== -1 && (rTarget.startsWith("http://") || rTarget.startsWith("https://"))) continue;

    // OPC-compliant resolution — the critical piece
    var resolved = resolveRelationshipTarget(sourceUri, rTarget);
    if (!resolved || !resolved.entryName) {
      missing++;
      details.push({ id: rId, type: rType.split("/").pop(), target: rTarget, resolved: null, status: "unresolved" });
      continue;
    }

    var entry = sourceZip.file(resolved.entryName);
    if (entry) {
      var buf = await entry.async("nodebuffer");
      targetZip.file(resolved.entryName, buf);
      copied++;
      details.push({ id: rId, type: rType.split("/").pop(), target: rTarget, resolved: resolved.entryName, status: "copied", bytes: buf.length });
    } else {
      missing++;
      details.push({ id: rId, type: rType.split("/").pop(), target: rTarget, resolved: resolved.entryName, status: "missing" });
      logger.log("[OPS] MISSING: " + resolved.entryName + " (rel " + rId + ", type " + rType.split("/").pop() + ")");
    }
  }
  logger.log("[OPS] External files: " + copied + " copied, " + missing + " missing");
  return { copied: copied, missing: missing, details: details };
}

// ── Create Minimal Target PPTX ────────────────────────────

export function createTargetPptx() {
  var zip = new JSZip();

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

  // Blank placeholder slide (will be overwritten by first real slide)
  var blankSlide = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
    '</p:sld>';
  zip.file("ppt/slides/slide1.xml", blankSlide);
  zip.file("ppt/slides/_rels/slide1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>');

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
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">\n' +
    '  <a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements>\n' +
    '</a:theme>');

  return zip;
}

// ── Placeholder Slide XML ─────────────────────────────────

export function createPlaceholderSlideXml(title, subtitle) {
  var safeTitle = (title || "Generated Slide").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  var safeSubtitle = (subtitle || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
    '  <p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F5F5F5"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>\n' +
    '    <p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
    '      <p:sp><p:nvSpPr><p:cNvPr id="2" name="PlaceholderTitle"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000000" y="1500000"/><a:ext cx="7000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>\n' +
    '        <p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2400" b="1"/><a:t>' + safeTitle + '</a:t></a:r></a:p></p:txBody>\n' +
    '      </p:sp>\n' +
    (safeSubtitle ? '      <p:sp><p:nvSpPr><p:cNvPr id="3" name="PlaceholderSubtitle"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000000" y="3000000"/><a:ext cx="7000000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>\n' +
    '        <p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1400"/><a:t>' + safeSubtitle + '</a:t></a:r></a:p></p:txBody>\n' +
    '      </p:sp>\n' : '') +
    '    </p:spTree>\n' +
    '  </p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
    '</p:sld>';
}

// ── Buffer Generation ─────────────────────────────────────

export async function generatePptxBuffer(zip) {
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ── Content Type Defaults ─────────────────────────────────

var CONTENT_TYPE_DEFAULTS = {
  "rels": "application/vnd.openxmlformats-package.relationships+xml",
  "xml": "application/xml",
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "gif": "image/gif",
  "bmp": "image/bmp",
  "svg": "image/svg+xml",
  "emf": "image/x-emf",
  "wmf": "image/x-wmf",
  "tiff": "image/tiff",
  "tif": "image/tiff",
  "wav": "audio/wav",
  "wma": "audio/x-ms-wma",
  "mp3": "audio/mpeg",
  "mp4": "video/mp4",
  "mov": "video/quicktime",
  "wmv": "video/x-ms-wmv",
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "vsd": "application/vnd.visio",
  "vml": "application/vnd.openxmlformats-officedocument.vmlDrawing",
};

// Ensure [Content_Types].xml has Default entries for all media extensions
export async function ensureContentTypeDefaults(zip) {
  var ctEntry = zip.file("[Content_Types].xml");
  if (!ctEntry) return;
  var ctText = await ctEntry.async("text");
  var changed = false;

  Object.keys(CONTENT_TYPE_DEFAULTS).forEach(function(ext) {
    var pattern = 'Extension="' + ext + '"';
    if (ctText.indexOf(pattern) === -1) {
      var insert = '  <Default Extension="' + ext + '" ContentType="' + CONTENT_TYPE_DEFAULTS[ext] + '"/>\n';
      ctText = ctText.replace('</Types>', insert + '</Types>');
      changed = true;
    }
  });

  if (changed) {
    zip.file("[Content_Types].xml", ctText);
  }
}

// ── Content Types Update ──────────────────────────────────

export async function updateContentTypes(zip, slideCount) {
  var ctEntry = zip.file("[Content_Types].xml");
  if (!ctEntry) return;
  var ctText = await ctEntry.async("text");
  for (var i = 2; i <= slideCount; i++) {
    var partName = "/ppt/slides/slide" + i + ".xml";
    if (ctText.indexOf(partName) === -1) {
      ctText = ctText.replace('</Types>',
        '  <Override PartName="' + partName + '" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n</Types>');
    }
  }
  zip.file("[Content_Types].xml", ctText);
}

// ── HTTP Helper ───────────────────────────────────────────

export function gapi(token, url, init) {
  return fetch(url, Object.assign({}, init, {
    headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
  })).then(function(r) {
    return r.text().then(function(t) {
      var data = {};
      var body = t || "";
      var contentType = r.headers.get("content-type") || "";
      try { data = t ? JSON.parse(t) : {}; } catch(e) {}
      return { ok: r.ok, status: r.status, contentType: contentType, data: data, body: body.substring(0, 2000) };
    });
  });
}
