// ═══════════════════════════════════════════════════════════
//  PPTX Slide Copy — Transitive dependency copy
//  Copies a slide AND all its dependencies (charts, diagrams,
//  images, layouts, masters, themes) from source to target.
//
//  This is the critical function for visual fidelity.
//  It uses the OPC resolver to walk the entire dependency tree
//  and copy every referenced part.
// ═══════════════════════════════════════════════════════════

import { XMLParser } from "fast-xml-parser";
import { OpcResolver, resolveRelationshipTarget } from "./opc-resolver.js";

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };
var parser = new XMLParser(XML_OPTS);

// Relationship types that reference parts we MUST copy for visual fidelity
var MUST_COPY_REL_TYPES = {
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagram": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramStyles": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tags": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster": true,
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme": true,
  "http://schemas.microsoft.com/office/2007/relationships/chartEx": true,
  "http://schemas.microsoft.com/office/2007/relationships/chartColorStyle": true,
  "http://schemas.microsoft.com/office/2007/relationships/chartStyle": true,
};

/**
 * Copy a slide and ALL its transitive dependencies from source to target.
 * This is the critical function for zero-red-X visual fidelity.
 *
 * @param targetZip       JSZip instance for output
 * @param sourceZip       JSZip instance for input
 * @param slideFilePath   Entry name in source (e.g., "ppt/slides/slide1.xml")
 * @param targetSlideNum  Slide number in target (1-based)
 * @param logger
 * @returns { copied: number, missing: number, details: [] }
 */
export async function copySlideWithDependencies(targetZip, sourceZip, slideFilePath, targetSlideNum, logger) {
  logger.log("[COPY] === Copying slide: " + slideFilePath + " -> slide" + targetSlideNum + " ===");

  var sourceUri = "/" + slideFilePath;
  var slideRelPath = slideFilePath.replace("ppt/slides/", "ppt/slides/_rels/").replace(".xml", ".xml.rels");

  // 1. Copy slide XML
  var slideEntry = sourceZip.file(slideFilePath);
  if (!slideEntry) throw new Error("Slide not found: " + slideFilePath);
  var slideXml = await slideEntry.async("text");
  targetZip.file("ppt/slides/slide" + targetSlideNum + ".xml", slideXml);
  logger.log("[COPY] Slide XML: " + slideXml.length + " chars");

  // 2. Walk transitive dependencies
  var copied = new Set(); // entry names already copied
  var missing = [];
  var details = [];
  var toProcess = []; // queue of { sourceEntryName, sourcePackageUri }

  // Start with the slide's own rels
  var slideRelEntry = sourceZip.file(slideRelPath);
  if (slideRelEntry) {
    var slideRelsText = await slideRelEntry.async("text");
    // Write rels to target (rIds stay the same)
    targetZip.file("ppt/slides/_rels/slide" + targetSlideNum + ".xml.rels", slideRelsText);
    enqueueDependencies(sourceUri, slideRelsText, toProcess, copied, logger);
  }

  // 3. Process dependency queue (BFS — breadth-first for clarity)
  while (toProcess.length > 0) {
    var item = toProcess.shift();
    if (copied.has(item.sourceEntryName)) continue;

    var entry = sourceZip.file(item.sourceEntryName);
    if (entry) {
      var buf = await entry.async("nodebuffer");
      targetZip.file(item.sourceEntryName, buf);
      copied.add(item.sourceEntryName);
      details.push({
        entry: item.sourceEntryName,
        status: "copied",
        bytes: buf.length,
        from: item.fromRId || "",
      });
      logger.log("[COPY]   Copied: " + item.sourceEntryName + " (" + buf.length + " bytes)");

      // If this part has its own .rels, enqueue ITS dependencies
      var partRelPath = getRelsPath(item.sourcePackageUri);
      var partRelEntry = sourceZip.file(partRelPath);
      if (partRelEntry) {
        var partRelsText = await partRelEntry.async("text");
        // Write the part's rels file too
        targetZip.file(partRelPath, partRelsText);
        enqueueDependencies(item.sourcePackageUri, partRelsText, toProcess, copied, logger);
      }
    } else {
      missing.push(item.sourceEntryName);
      details.push({
        entry: item.sourceEntryName,
        status: "missing",
        from: item.fromRId || "",
      });
      logger.log("[COPY]   MISSING: " + item.sourceEntryName);
    }
  }

  logger.log("[COPY] === Done: " + copied.size + " copied, " + missing.length + " missing ===");
  return {
    copied: copied.size,
    missing: missing.length,
    missingList: missing,
    details: details,
  };
}

/**
 * Parse a .rels file and enqueue all MUST-COPY dependencies.
 */
function enqueueDependencies(sourcePackageUri, relsText, queue, copied, logger) {
  var relDoc = parser.parse(relsText);
  var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
  if (!rels) return;
  if (!Array.isArray(rels)) rels = [rels];

  for (var i = 0; i < rels.length; i++) {
    var r = rels[i];
    var rType = r["@_Type"] || "";
    var rTarget = r["@_Target"] || "";
    var rId = r["@_Id"] || "";

    // Skip if not a type we need to copy
    if (!MUST_COPY_REL_TYPES[rType]) continue;
    // Skip external URLs
    if (rTarget.indexOf(":") !== -1 && (rTarget.startsWith("http://") || rTarget.startsWith("https://"))) continue;

    var resolved = resolveRelationshipTarget(sourcePackageUri, rTarget);
    if (resolved && resolved.entryName && !copied.has(resolved.entryName)) {
      queue.push({
        sourceEntryName: resolved.entryName,
        sourcePackageUri: resolved.partUri || "/" + resolved.entryName,
        fromRId: rId,
        relType: rType,
      });
    }
  }
}

/**
 * Get the .rels file path for a given part URI.
 * e.g., "/ppt/slides/slide1.xml" -> "ppt/slides/_rels/slide1.xml.rels"
 */
function getRelsPath(packageUri) {
  if (!packageUri || packageUri === "/") return "_rels/.rels";
  var normalized = packageUri.startsWith("/") ? packageUri.substring(1) : packageUri;
  var lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return "_rels/" + normalized + ".rels";
  var dir = normalized.substring(0, lastSlash);
  var file = normalized.substring(lastSlash + 1);
  return dir + "/_rels/" + file + ".rels";
}
