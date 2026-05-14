// ═══════════════════════════════════════════════════════════
//  BRINC SLIDE DNA SYSTEM
//  Extracts precise visual DNA from slides, defines reusable
//  components, scores visual similarity, clones templates.
// ═══════════════════════════════════════════════════════════

// ── 1. DNA EXTRACTION ────────────────────────────────────

/**
 * Extract full DNA from a Google Slide object (from Slides API response).
 * Returns structured element data + layout fingerprint.
 */
function extractSlideDNA(slide, slideType, archetype, sourceDeck, modifiedTime) {
  var elements = [];
  var layoutFingerprint = {
    elementCount: 0,
    textElementCount: 0,
    shapeElementCount: 0,
    imageElementCount: 0,
    hasDivider: false,
    hasBackground: false,
    hasImage: false,
    columnCount: 0,
    maxTextLength: 0,
    avgFontSize: 0,
    dominantColor: null,
    bgColor: null,
  };

  var fontSizes = [];
  var colors = [];
  var textXPositions = [];

  (slide.pageElements || []).forEach(function(el) {
    var dna = extractElementDNA(el);
    if (!dna) return;

    elements.push(dna);
    layoutFingerprint.elementCount++;

    if (dna.type === "TEXT" || (dna.type === "SHAPE" && dna.text)) {
      layoutFingerprint.textElementCount++;
      fontSizes.push(dna.fontSize || 14);
      textXPositions.push(dna.position ? dna.position.x : 0);
      if (dna.text && dna.text.length > layoutFingerprint.maxTextLength) {
        layoutFingerprint.maxTextLength = dna.text.length;
      }
    }
    if (dna.type === "SHAPE") layoutFingerprint.shapeElementCount++;
    if (dna.type === "IMAGE") {
      layoutFingerprint.imageElementCount++;
      layoutFingerprint.hasImage = true;
    }
    if (dna.isDivider) layoutFingerprint.hasDivider = true;
    if (dna.isBackground) layoutFingerprint.hasBackground = true;
    if (dna.color) colors.push(dna.color);
  });

  // Calculate column count from text X positions
  if (textXPositions.length > 1) {
    var uniqueXs = {};
    textXPositions.forEach(function(x) {
      var rounded = Math.round(x / 20) * 20; // bucket by 20pt
      uniqueXs[rounded] = (uniqueXs[rounded] || 0) + 1;
    });
    layoutFingerprint.columnCount = Object.keys(uniqueXs).length;
  }

  // Average font size
  if (fontSizes.length > 0) {
    layoutFingerprint.avgFontSize = Math.round(
      fontSizes.reduce(function(a, b) { return a + b; }, 0) / fontSizes.length
    );
  }

  // Dominant color (mode of non-white, non-black colors)
  if (colors.length > 0) {
    var colorCounts = {};
    colors.forEach(function(c) {
      var key = rgbToHex(c);
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    });
    var sorted = Object.entries(colorCounts).sort(function(a, b) { return b[1] - a[1]; });
    if (sorted[0] && sorted[0][1] > 1) {
      layoutFingerprint.dominantColor = sorted[0][0];
    }
  }

  // Detect component type from DNA
  var detectedComponents = detectComponents(elements, layoutFingerprint);

  return {
    slideId: slide.objectId,
    slideType: slideType,
    archetype: archetype,
    sourceDeck: sourceDeck,
    modifiedTime: modifiedTime,
    elements: elements,
    layoutFingerprint: layoutFingerprint,
    detectedComponents: detectedComponents,
    componentSignature: detectedComponents.map(function(c) { return c.type; }).join(","),
  };
}

function extractElementDNA(el) {
  if (!el.shape && !el.image) return null;

  var tf = el.transform || {};
  var size = el.size || {};
  var pos = {
    x: tf.translateX || 0,
    y: tf.translateY || 0,
    scaleX: tf.scaleX || 1,
    scaleY: tf.scaleY || 1,
  };
  var dim = {
    width: (size.width && size.width.magnitude) || 0,
    height: (size.height && size.height.magnitude) || 0,
  };

  var dna = {
    id: el.objectId,
    type: el.image ? "IMAGE" : "SHAPE",
    shapeType: el.shape ? el.shape.shapeType : null,
    position: pos,
    size: dim,
    rotation: el.transform && el.transform.rotate ? el.transform.rotate : 0,
  };

  // Extract text properties
  if (el.shape && el.shape.text && el.shape.text.textElements) {
    var textParts = [];
    var isBold = false;
    var fontSize = 14;
    var color = null;

    el.shape.text.textElements.forEach(function(te) {
      if (te.textRun && te.textRun.content) {
        var content = te.textRun.content.trim();
        if (content) textParts.push(content);
        if (te.textRun.style) {
          if (te.textRun.style.bold) isBold = true;
          if (te.textRun.style.fontSize && te.textRun.style.fontSize.magnitude) {
            fontSize = te.textRun.style.fontSize.magnitude;
          }
          if (te.textRun.style.foregroundColor && te.textRun.style.foregroundColor.opaqueColor) {
            var fc = te.textRun.style.foregroundColor.opaqueColor;
            if (fc.rgbColor) color = fc.rgbColor;
          }
        }
      }
    });

    dna.text = textParts.join(" ");
    dna.bold = isBold;
    dna.fontSize = fontSize;
    dna.color = color;
  }

  // Extract fill color
  if (el.shape && el.shape.shapeProperties) {
    var sp = el.shape.shapeProperties;
    if (sp.shapeBackgroundFill && sp.shapeBackgroundFill.solidFill) {
      var fill = sp.shapeBackgroundFill.solidFill;
      if (fill.color && fill.color.rgbColor) {
        dna.fillColor = fill.color.rgbColor;
        // Detect if this is a background element (large rectangle, low position)
        if (dna.shapeType === "RECTANGLE" && dim.width > 600 && dim.height > 400 && pos.y < 50) {
          dna.isBackground = true;
        }
        // Detect divider (thin rectangle)
        if (dna.shapeType === "RECTANGLE" && dim.height <= 8 && dim.width > 40 && dim.width < 400) {
          dna.isDivider = true;
        }
      }
    }
  }

  return dna;
}

function rgbToHex(c) {
  if (!c) return "#000000";
  var r = Math.round((c.red || 0) * 255);
  var g = Math.round((c.green || 0) * 255);
  var b = Math.round((c.blue || 0) * 255);
  return "#" + [r, g, b].map(function(v) {
    return v.toString(16).padStart(2, "0");
  }).join("");
}

// ── 2. COMPONENT DETECTION ────────────────────────────────

/**
 * Detect which Brinc components are present in a slide's DNA.
 */
function detectComponents(elements, fingerprint) {
  var components = [];
  var sortedByY = elements.slice().sort(function(a, b) {
    return (a.position ? a.position.y : 0) - (b.position ? b.position.y : 0);
  });

  // Cover detection: large navy background + prominent title
  var hasLargeBg = elements.some(function(e) {
    return e.isBackground && e.fillColor && isNavy(e.fillColor);
  });
  var hasLargeTitle = elements.some(function(e) {
    return e.text && e.fontSize >= 36 && e.color && isWhite(e.color);
  });
  if (hasLargeBg && hasLargeTitle) {
    components.push({ type: "navy_cover", confidence: 0.95 });
  }

  // Title sentence: light bg + centered large text + no subtitle
  var titleSentences = elements.filter(function(e) {
    return e.text && e.fontSize >= 32 && e.fontSize <= 44 && e.position && e.position.y < 300;
  });
  if (titleSentences.length === 1 && !fingerprint.hasDivider && fingerprint.elementCount <= 4) {
    components.push({ type: "title_sentence", confidence: 0.85 });
  }

  // Section header: accent divider + heading text
  var hasAccentDivider = elements.some(function(e) {
    return e.isDivider && e.fillColor && isAccent(e.fillColor);
  });
  var hasHeading = elements.some(function(e) {
    return e.text && e.fontSize >= 24 && e.fontSize <= 32 && e.bold;
  });
  if (hasAccentDivider && hasHeading) {
    components.push({ type: "section_header", confidence: 0.9 });
  }

  // Two-column: vertical divider + text on both sides
  var hasVerticalDivider = elements.some(function(e) {
    return e.shapeType === "RECTANGLE" && e.size &&
           e.size.width <= 2 && e.size.height > 100;
  });
  if (hasVerticalDivider || fingerprint.columnCount >= 2) {
    components.push({ type: "two_column", confidence: 0.8 });
  }

  // Metrics grid: multiple large numbers + labels
  var largeNumbers = elements.filter(function(e) {
    return e.text && /^\$?[\d,.]+[BKMT+]?$/.test(e.text.trim()) && e.fontSize >= 28;
  });
  if (largeNumbers.length >= 3) {
    components.push({ type: "metrics_grid", confidence: 0.85 });
  }

  // Timeline: horizontal line + multiple dots/nodes
  var hasTimelineLine = elements.some(function(e) {
    return e.isDivider && e.size && e.size.width > 300;
  });
  var nodes = elements.filter(function(e) {
    return e.shapeType === "RECTANGLE" && e.size &&
           e.size.width <= 20 && e.size.height <= 20;
  });
  if (hasTimelineLine && nodes.length >= 2) {
    components.push({ type: "timeline", confidence: 0.9 });
  }

  // Case study: result numbers + description text
  var hasResults = elements.some(function(e) {
    return e.text && (e.text.includes("$") || e.text.includes("+") || /\d+\s*(startups|companies|pilots)/.test(e.text));
  });
  if (hasResults && fingerprint.textElementCount >= 3) {
    components.push({ type: "case_study_card", confidence: 0.7 });
  }

  // Image slide
  if (fingerprint.hasImage) {
    components.push({ type: "image_slide", confidence: 0.8 });
  }

  // Fallback
  if (components.length === 0) {
    components.push({ type: "text_content", confidence: 0.5 });
  }

  return components;
}

function isNavy(c) {
  return c.red < 0.2 && c.green < 0.25 && c.blue < 0.4;
}

function isWhite(c) {
  return c.red > 0.9 && c.green > 0.9 && c.blue > 0.9;
}

function isAccent(c) {
  return c.red > 0.15 && c.red < 0.35 && c.green > 0.3 && c.green < 0.65 && c.blue > 0.55 && c.blue < 0.9;
}

// ── 3. VISUAL SIMILARITY SCORING ─────────────────────────

/**
 * Score visual similarity between two slide DNAs.
 * Returns 0-100 score.
 */
function scoreVisualSimilarity(dnaA, dnaB) {
  if (!dnaA || !dnaB) return 0;
  var score = 0;
  var maxScore = 0;

  // Element count similarity (15)
  var countDiff = Math.abs(dnaA.layoutFingerprint.elementCount - dnaB.layoutFingerprint.elementCount);
  score += Math.max(0, 15 - countDiff * 3);
  maxScore += 15;

  // Component signature overlap (25)
  if (dnaA.detectedComponents && dnaB.detectedComponents) {
    var sigA = dnaA.detectedComponents.map(function(c) { return c.type; });
    var sigB = dnaB.detectedComponents.map(function(c) { return c.type; });
    var shared = sigA.filter(function(s) { return sigB.indexOf(s) >= 0; });
    score += shared.length > 0 ? 25 : 0;
  }
  maxScore += 25;

  // Has divider match (10)
  if (dnaA.layoutFingerprint.hasDivider === dnaB.layoutFingerprint.hasDivider) {
    score += 10;
  }
  maxScore += 10;

  // Has image match (10)
  if (dnaA.layoutFingerprint.hasImage === dnaB.layoutFingerprint.hasImage) {
    score += 10;
  }
  maxScore += 10;

  // Average font size similarity (10)
  var fontDiff = Math.abs(dnaA.layoutFingerprint.avgFontSize - dnaB.layoutFingerprint.avgFontSize);
  score += Math.max(0, 10 - fontDiff);
  maxScore += 10;

  // Dominant color match (10)
  if (dnaA.layoutFingerprint.dominantColor && dnaB.layoutFingerprint.dominantColor) {
    score += dnaA.layoutFingerprint.dominantColor === dnaB.layoutFingerprint.dominantColor ? 10 : 0;
  }
  maxScore += 10;

  // Text element count similarity (10)
  var textDiff = Math.abs(dnaA.layoutFingerprint.textElementCount - dnaB.layoutFingerprint.textElementCount);
  score += Math.max(0, 10 - textDiff * 2);
  maxScore += 10;

  return maxScore > 0 ? Math.floor(score * 100 / maxScore) : 0;
}

// ── 4. TEMPLATE CLONING ───────────────────────────────────

/**
 * Build a batchUpdate request to clone a slide from a source presentation.
 * Uses the copySlide API to physically duplicate the slide.
 * Then returns the copied slide ID for text replacement.
 */
function buildCloneRequest(newSlideId, sourcePresentationId, sourceSlideId) {
  return {
    copySlide: {
      objectId: newSlideId,
      sourceObjectId: sourceSlideId,
      destinationPresentationId: null, // Uses current presentation (set at call time)
      sourcePresentationId: sourcePresentationId,
    }
  };
}

/**
 * After cloning a slide, build requests to replace text on all text elements.
 * Uses elementIds from the source DNA to find matching elements.
 */
function buildTextReplacementRequests(copiedSlideId, sourceDNA, newContent) {
  var reqs = [];

  // For each text element in the source, replace text
  sourceDNA.elements.forEach(function(el) {
    if (!el.text || !el.id) return;

    // Map old element ID to new (Google prefixes copied elements)
    // We use a wildcard approach: delete all text, insert new
    var newElId = el.id; // copySlide preserves IDs when no collision

    // Simple replacement: if this element has content matching a key, replace it
    var replacement = findReplacementForElement(el, newContent);
    if (replacement) {
      // Delete existing text
      reqs.push({
        deleteText: {
          objectId: newElId,
          textRange: { type: "ALL" },
        }
      });
      // Insert new text
      reqs.push({
        insertText: {
          objectId: newElId,
          text: replacement,
          insertionIndex: 0,
        }
      });
    }
  });

  return reqs;
}

function findReplacementForElement(el, newContent) {
  // Heuristic: match element type and position to content
  if (el.isBackground || el.isDivider) return null; // Don't replace decorative elements

  // If this is the main title (largest text, top of slide)
  if (el.fontSize >= 24 && el.position && el.position.y < 150) {
    return newContent.title || null;
  }

  // If this is subtitle text
  if (el.fontSize >= 12 && el.fontSize < 20 && el.position && el.position.y >= 100 && el.position.y < 250) {
    return newContent.subtitle || null;
  }

  // Body text
  if (el.fontSize >= 10 && el.fontSize < 18 && newContent.body && newContent.body.length > 0) {
    return newContent.body.join("\n");
  }

  return null;
}

// ── 5. ARCHETYPE DESIGN RULES ─────────────────────────────

/**
 * Define component preferences per archetype.
 * Used to guide which components to prefer when multiple options exist.
 */
var ARCHETYPE_COMPONENT_RULES = {
  accelerator: {
    required: ["navy_cover", "title_sentence", "section_header"],
    preferred: ["timeline", "metrics_grid", "two_column", "case_study_card"],
    avoid: ["image_slide"],
    rhythm: ["header", "content", "visual", "content", "data", "content", "next"],
  },
  incubator: {
    required: ["navy_cover", "title_sentence"],
    preferred: ["two_column", "section_header", "case_study_card"],
    avoid: ["metrics_grid"],
    rhythm: ["header", "content", "content", "visual", "content", "next"],
  },
  soft_landing: {
    required: ["navy_cover", "title_sentence"],
    preferred: ["section_header", "two_column", "ecosystem_grid"],
    avoid: [],
    rhythm: ["header", "content", "visual", "content", "data", "next"],
  },
  sandbox: {
    required: ["navy_cover", "title_sentence", "section_header"],
    preferred: ["two_column", "section_header", "reporting_table"],
    avoid: ["image_slide"],
    rhythm: ["header", "content", "content", "data", "content", "next"],
  },
  innovation_challenge: {
    required: ["navy_cover", "title_sentence"],
    preferred: ["metrics_grid", "timeline", "case_study_card"],
    avoid: [],
    rhythm: ["header", "visual", "content", "data", "content", "next"],
  },
  corporate_innovation: {
    required: ["navy_cover", "title_sentence", "section_header"],
    preferred: ["two_column", "section_header", "process_flow", "reporting_table"],
    avoid: [],
    rhythm: ["header", "content", "visual", "content", "data", "next"],
  },
  ai_training: {
    required: ["navy_cover", "title_sentence"],
    preferred: ["section_header", "curriculum_grid", "two_column"],
    avoid: ["metrics_grid"],
    rhythm: ["header", "content", "content", "visual", "next"],
  },
  government_capability: {
    required: ["navy_cover", "title_sentence", "section_header"],
    preferred: ["title_sentence", "ecosystem_grid", "metrics_grid", "reporting_table"],
    avoid: ["image_slide"],
    rhythm: ["sentence", "header", "visual", "content", "data", "content", "next"],
  },
  executive_workshop: {
    required: ["navy_cover", "title_sentence"],
    preferred: ["section_header", "two_column"],
    avoid: ["metrics_grid", "timeline"],
    rhythm: ["header", "content", "content", "next"],
  },
  venture_building: {
    required: ["navy_cover", "title_sentence"],
    preferred: ["two_column", "section_header", "case_study_card"],
    avoid: [],
    rhythm: ["header", "content", "visual", "content", "next"],
  },
};

/**
 * Given an archetype and section type, determine the best component to use.
 */
function selectComponentForSection(archetype, sectionType) {
  var rules = ARCHETYPE_COMPONENT_RULES[archetype] || ARCHETYPE_COMPONENT_RULES.accelerator;

  // Map section types to component types
  var sectionToComponent = {
    cover: "navy_cover",
    title_sentence: "title_sentence",
    executive_summary: "section_header",
    challenge_framing: "section_header",
    objectives: "section_header",
    approach: "two_column",
    scouting: "section_header",
    startup_support: "two_column",
    pilot_execution: "section_header",
    commercialization: "section_header",
    timeline: "timeline",
    case_study: "case_study_card",
    why_brinc: "metrics_grid",
    next_steps: "section_header",
    ecosystem: "section_header",
    reporting: "two_column",
    team: "section_header",
    market_opportunity: "section_header",
    why_now: "section_header",
    strategic_context: "section_header",
    opportunity: "section_header",
    venture_building: "section_header",
    curriculum: "section_header",
    regulatory_context: "section_header",
    challenge_statement: "section_header",
    awards: "metrics_grid",
  };

  var preferred = sectionToComponent[sectionType] || "section_header";

  // Check if archetype has this in preferred list
  if (rules.preferred.indexOf(preferred) < 0 && rules.preferred.length > 0) {
    // Fall back to first preferred component
    preferred = rules.preferred[0];
  }

  return preferred;
}

// ── 6. BUILD DNA INDEX ────────────────────────────────────

/**
 * Build a DNA index from scanned deck data.
 */
function buildDNAIndex(deckProfiles) {
  var allDNA = [];
  deckProfiles.forEach(function(deck) {
    if (deck.slideDNA) {
      deck.slideDNA.forEach(function(dna) {
        allDNA.push(dna);
      });
    }
  });
  return {
    slides: allDNA,
    componentCounts: countComponents(allDNA),
    builtAt: new Date().toISOString(),
  };
}

function countComponents(dnaList) {
  var counts = {};
  dnaList.forEach(function(dna) {
    (dna.detectedComponents || []).forEach(function(c) {
      counts[c.type] = (counts[c.type] || 0) + 1;
    });
  });
  return counts;
}

// ── Exports ───────────────────────────────────────────────

export {
  extractSlideDNA,
  extractElementDNA,
  detectComponents,
  scoreVisualSimilarity,
  buildCloneRequest,
  buildTextReplacementRequests,
  selectComponentForSection,
  buildDNAIndex,
  ARCHETYPE_COMPONENT_RULES,
};
