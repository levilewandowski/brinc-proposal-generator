// ═══════════════════════════════════════════════════════════
//  OPC Resolver — ECMA-376 Part 2 compliant
//  Open Packaging Convention URI resolution for PPTX
//
//  Why this matters:
//  PPTX is an OPC package. Every relationship target must be
//  resolved using OPC URI rules, not string concatenation.
//  Wrong resolution = broken images, charts, diagrams.
//
//  Usage:
//    var resolver = new OpcResolver(zip);
//    await resolver.load();
//    var resolved = resolver.resolveTarget("/ppt/slides/slide1.xml", "../media/image1.png");
//    // resolved.partUri → "/ppt/media/image1.png"
//    // resolved.entryName → "ppt/media/image1.png" (for JSZip)
//    // resolved.exists → true/false
// ═══════════════════════════════════════════════════════════

import { XMLParser } from "fast-xml-parser";

var XML_OPTS = { ignoreAttributes: false, attributeNamePrefix: "@_" };
var parser = new XMLParser(XML_OPTS);

/**
 * Normalize a package URI:
 *   - Remove leading "/"
 *   - Remove empty segments
 *   - Resolve . and ..
 *   - Collapse multiple slashes
 */
function normalizePackageUri(uri) {
  if (!uri) return "";
  // Remove leading slash
  var path = uri.startsWith("/") ? uri.substring(1) : uri;
  // Split, resolve . and ..
  var segments = path.split("/").filter(function(s) { return s && s !== "."; });
  var result = [];
  for (var i = 0; i < segments.length; i++) {
    if (segments[i] === "..") {
      result.pop();
    } else {
      result.push(segments[i]);
    }
  }
  return result.join("/");
}

/**
 * Convert package URI to ZIP entry name (no leading /)
 */
function packageUriToEntryName(packageUri) {
  return normalizePackageUri(packageUri);
}

/**
 * Convert ZIP entry name to package URI (leading /)
 */
function entryNameToPackageUri(entryName) {
  var normalized = normalizePackageUri(entryName);
  return normalized ? "/" + normalized : "/";
}

/**
 * Resolve a relationship target against a source part URI
 * per OPC §9.1.1.3
 */
function resolveRelationshipTarget(sourcePackageUri, targetUri) {
  if (!sourcePackageUri || !targetUri) return null;

  // External target (URL)
  if (targetUri.indexOf(":") !== -1 && (targetUri.startsWith("http://") || targetUri.startsWith("https://") || targetUri.startsWith("file://") || targetUri.startsWith("ftp://"))) {
    return { partUri: null, entryName: null, isExternal: true, isInternal: false, href: targetUri };
  }

  var resolved;
  if (targetUri.startsWith("/")) {
    // Absolute reference within package
    resolved = normalizePackageUri(targetUri);
  } else {
    // Relative reference — resolve against source directory
    var sourceDir = sourcePackageUri.substring(0, sourcePackageUri.lastIndexOf("/") + 1);
    // OPC resolution: sourceDir + targetUri, then normalize
    var combined = sourceDir + targetUri;
    resolved = normalizePackageUri(combined);
  }

  if (!resolved) return null;

  return {
    partUri: "/" + resolved,
    entryName: resolved,
    isExternal: false,
    isInternal: true,
  };
}

/**
 * Get directory of a part URI (for relative resolution)
 */
function getPartDirectory(packageUri) {
  if (!packageUri) return "/";
  var lastSlash = packageUri.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return packageUri.substring(0, lastSlash + 1);
}

/**
 * Get filename from a part URI
 */
function getPartFilename(packageUri) {
  if (!packageUri) return "";
  var lastSlash = packageUri.lastIndexOf("/");
  return lastSlash >= 0 ? packageUri.substring(lastSlash + 1) : packageUri;
}

/**
 * Check if a URI references a known image/media file by extension
 */
function isMediaUri(packageUri) {
  if (!packageUri) return false;
  var ext = packageUri.split(".").pop().toLowerCase();
  var mediaExts = {
    png: true, jpg: true, jpeg: true, gif: true, bmp: true,
    svg: true, emf: true, wmf: true, tiff: true, tif: true,
    wav: true, wma: true, mp3: true, mp4: true, mov: true, wmv: true,
    xlsx: true, vsd: true, vml: true,
  };
  return mediaExts[ext] || false;
}

/**
 * Get content type for a part by extension from [Content_Types].xml
 */
function getContentTypeForExtension(ext, contentTypesDoc) {
  if (!contentTypesDoc || !ext) return null;
  var defaults = contentTypesDoc.Types && contentTypesDoc.Types.Default;
  if (!defaults) return null;
  if (!Array.isArray(defaults)) defaults = [defaults];
  for (var i = 0; i < defaults.length; i++) {
    if (defaults[i]["@_Extension"] === ext) {
      return defaults[i]["@_ContentType"];
    }
  }
  return null;
}

/**
 * Get content type for a part by override from [Content_Types].xml
 */
function getContentTypeForPart(packageUri, contentTypesDoc) {
  if (!contentTypesDoc || !packageUri) return null;
  var overrides = contentTypesDoc.Types && contentTypesDoc.Types.Override;
  if (!overrides) return null;
  if (!Array.isArray(overrides)) overrides = [overrides];
  for (var i = 0; i < overrides.length; i++) {
    if (overrides[i]["@_PartName"] === packageUri) {
      return overrides[i]["@_ContentType"];
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  OPC Resolver Class
// ═══════════════════════════════════════════════════════════

export class OpcResolver {
  constructor(zip) {
    this.zip = zip; // JSZip instance
    this.contentTypesDoc = null;
    this.relationships = {}; // partUri -> [{rId, type, target, resolved}]
    this._loaded = false;
  }

  /**
   * Load all relationships and content types from the package
   */
  async load() {
    if (this._loaded) return;

    // 1. Parse [Content_Types].xml
    var ctEntry = this.zip.file("[Content_Types].xml");
    if (ctEntry) {
      var ctText = await ctEntry.async("text");
      this.contentTypesDoc = parser.parse(ctText);
    }

    // 2. Find all .rels files and parse them
    var relFiles = Object.keys(this.zip.files).filter(function(name) {
      return name.endsWith(".rels") && !name.endsWith("/[Content_Types].xml");
    });

    for (var i = 0; i < relFiles.length; i++) {
      var relFileName = relFiles[i];
      var sourcePackageUri = this._relsFileToPartUri(relFileName);
      var relText = await this.zip.file(relFileName).async("text");
      var relDoc = parser.parse(relText);
      var rels = relDoc["Relationships"] && relDoc["Relationships"]["Relationship"];
      if (!rels) continue;
      if (!Array.isArray(rels)) rels = [rels];

      this.relationships[sourcePackageUri] = rels.map(function(r) {
        var target = r["@_Target"] || "";
        var resolved = resolveRelationshipTarget(sourcePackageUri, target);
        return {
          rId: r["@_Id"] || "",
          type: r["@_Type"] || "",
          target: target,
          resolved: resolved,
        };
      });
    }

    this._loaded = true;
  }

  /**
   * Convert a .rels file name to its source part URI
   * e.g., "ppt/_rels/presentation.xml.rels" -> "/ppt/presentation.xml"
   */
  _relsFileToPartUri(relsFileName) {
    if (relsFileName === "_rels/.rels") {
      return "/"; // Package-level relationships
    }
    // "path/to/_rels/file.xml.rels" -> "path/to/file.xml"
    var withoutRels = relsFileName.replace(/\/_rels\//g, "/").replace(/\.rels$/, "");
    return "/" + withoutRels;
  }

  /**
   * Get the part URI for a .rels file
   * e.g., "ppt/slides/_rels/slide1.xml.rels" -> "/ppt/slides/slide1.xml"
   */
  _relsNameToPartUri(relsFileName) {
    return this._relsFileToPartUri(relsFileName);
  }

  /**
   * Resolve a relationship target from a source part
   */
  resolveTarget(sourcePackageUri, targetUri) {
    return resolveRelationshipTarget(sourcePackageUri, targetUri);
  }

  /**
   * Get all relationships for a part
   */
  getRelationships(partUri) {
    return this.relationships[partUri] || [];
  }

  /**
   * Get a specific relationship by rId
   */
  getRelationshipById(partUri, rId) {
    var rels = this.relationships[partUri] || [];
    for (var i = 0; i < rels.length; i++) {
      if (rels[i].rId === rId) return rels[i];
    }
    return null;
  }

  /**
   * Check if a resolved target exists in the package
   */
  targetExists(resolved) {
    if (!resolved || !resolved.entryName) return false;
    return !!this.zip.file(resolved.entryName);
  }

  /**
   * Get all unresolved/broken relationships
   */
  getBrokenRelationships() {
    var broken = [];
    var partUris = Object.keys(this.relationships);
    for (var i = 0; i < partUris.length; i++) {
      var partUri = partUris[i];
      var rels = this.relationships[partUri];
      for (var j = 0; j < rels.length; j++) {
        var rel = rels[j];
        if (rel.resolved && rel.resolved.isInternal && !this.targetExists(rel.resolved)) {
          broken.push({
            sourcePart: partUri,
            rId: rel.rId,
            type: rel.type,
            target: rel.target,
            resolvedPartUri: rel.resolved.partUri,
            resolvedEntryName: rel.resolved.entryName,
          });
        }
      }
    }
    return broken;
  }

  /**
   * Get all media references (images, audio, video, etc.)
   */
  getMediaReferences() {
    var media = [];
    var relTypes = {
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image": "image",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio": "audio",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video": "video",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart": "chart",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagram": "diagram",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject": "ole",
    };

    var partUris = Object.keys(this.relationships);
    for (var i = 0; i < partUris.length; i++) {
      var partUri = partUris[i];
      var rels = this.relationships[partUri];
      for (var j = 0; j < rels.length; j++) {
        var rel = rels[j];
        var mediaType = relTypes[rel.type];
        if (mediaType && rel.resolved && rel.resolved.isInternal) {
          media.push({
            sourcePart: partUri,
            rId: rel.rId,
            mediaType: mediaType,
            relType: rel.type,
            target: rel.target,
            partUri: rel.resolved.partUri,
            entryName: rel.resolved.entryName,
            exists: this.targetExists(rel.resolved),
          });
        }
      }
    }
    return media;
  }

  /**
   * Get content type for a part
   */
  getContentType(packageUri) {
    // Try override first
    var ct = getContentTypeForPart(packageUri, this.contentTypesDoc);
    if (ct) return ct;
    // Try default by extension
    var ext = packageUri.split(".").pop().toLowerCase();
    return getContentTypeForExtension(ext, this.contentTypesDoc);
  }

  /**
   * Get summary statistics
   */
  getStats() {
    var totalRels = 0;
    var internalRels = 0;
    var externalRels = 0;
    var brokenRels = 0;
    var mediaRefs = this.getMediaReferences();
    var mediaMissing = 0;

    var partUris = Object.keys(this.relationships);
    for (var i = 0; i < partUris.length; i++) {
      var rels = this.relationships[partUris[i]];
      for (var j = 0; j < rels.length; j++) {
        totalRels++;
        if (rels[j].resolved) {
          if (rels[j].resolved.isInternal) internalRels++;
          if (rels[j].resolved.isExternal) externalRels++;
          if (!this.targetExists(rels[j].resolved)) brokenRels++;
        }
      }
    }

    for (var k = 0; k < mediaRefs.length; k++) {
      if (!mediaRefs[k].exists) mediaMissing++;
    }

    return {
      totalRelationships: totalRels,
      internalRelationships: internalRels,
      externalRelationships: externalRels,
      brokenRelationships: brokenRels,
      mediaReferences: mediaRefs.length,
      mediaMissing: mediaMissing,
      partsWithRelationships: partUris.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════
//  Static utilities (for use without instantiating)
// ═══════════════════════════════════════════════════════════

export {
  normalizePackageUri,
  packageUriToEntryName,
  entryNameToPackageUri,
  resolveRelationshipTarget,
  getPartDirectory,
  getPartFilename,
  isMediaUri,
  getContentTypeForExtension,
  getContentTypeForPart,
};
