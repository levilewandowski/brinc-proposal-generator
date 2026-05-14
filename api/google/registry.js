// ═══════════════════════════════════════════════════════════
//  BRINC MASTER COMPONENT REGISTRY
//  Canonical reusable slide components with full geometry,
//  typography, color systems, spacing, hierarchy, variants,
//  and archetype usage tracking.
// ═══════════════════════════════════════════════════════════

// ── Color System ────────────────────────────────────────

var C = {
  navy:          { red: 0.105, green: 0.164, blue: 0.290 },
  navyDark:      { red: 0.070, green: 0.110, blue: 0.200 },
  navyLight:     { red: 0.160, green: 0.240, blue: 0.380 },
  white:         { red: 1.000, green: 1.000, blue: 1.000 },
  offWhite:      { red: 0.960, green: 0.960, blue: 0.960 },
  gray:          { red: 0.330, green: 0.330, blue: 0.330 },
  grayLight:     { red: 0.550, green: 0.550, blue: 0.550 },
  grayLighter:   { red: 0.750, green: 0.750, blue: 0.750 },
  accent:        { red: 0.200, green: 0.400, blue: 0.700 },
  accentLight:   { red: 0.350, green: 0.550, blue: 0.850 },
  accentBright:  { red: 0.120, green: 0.520, blue: 0.880 },
  green:         { red: 0.180, green: 0.620, blue: 0.380 },
  orange:        { red: 0.920, green: 0.520, blue: 0.180 },
  purple:        { red: 0.450, green: 0.250, blue: 0.650 },
};

// ── Typography System ────────────────────────────────────

var TYPE = {
  hero:       { fontSize: { magnitude: 42, unit: "PT" }, bold: true, color: C.white },
  title:      { fontSize: { magnitude: 36, unit: "PT" }, bold: true, color: C.navy },
  heading:    { fontSize: { magnitude: 28, unit: "PT" }, bold: true, color: C.navy },
  subheading: { fontSize: { magnitude: 16, unit: "PT" }, bold: true, color: C.accent },
  body:       { fontSize: { magnitude: 13, unit: "PT" }, bold: false, color: C.gray },
  bodyBold:   { fontSize: { magnitude: 13, unit: "PT" }, bold: true, color: C.gray },
  caption:    { fontSize: { magnitude: 11, unit: "PT" }, bold: false, color: C.grayLight },
  metric:     { fontSize: { magnitude: 36, unit: "PT" }, bold: true, color: C.navy },
  metricLabel:{ fontSize: { magnitude: 12, unit: "PT" }, bold: false, color: C.gray },
  coverTitle: { fontSize: { magnitude: 44, unit: "PT" }, bold: true, color: C.white },
  coverSub:   { fontSize: { magnitude: 22, unit: "PT" }, bold: false, color: C.grayLight },
  timeline:   { fontSize: { magnitude: 10, unit: "PT" }, bold: false, color: C.gray },
  timelineDot:{ size: 15 },
};

// ── Spacing System ───────────────────────────────────────

var SPACING = {
  page: { w: 720, h: 540 },
  margin: { x: 40, y: 40 },
  gutter: 20,
  col2: { left: 40, right: 390, width: 320, mid: 370 },
  col3: { w: 200, gap: 20 },
  accentBar: { w: 80, h: 4 },
  section: {
    headerY: 48,
    subtitleY: 98,
    bodyY: 130,
    bodyY_noSub: 105,
  },
  cover: {
    titleY: 170,
    subtitleY: 250,
    accentY: 300,
    contextY: 320,
    dateY: 480,
  },
  timeline: {
    barY: 140,
    dotY: 134,
    labelY: 160,
  },
};

// ═══════════════════════════════════════════════════════════
//  MASTER COMPONENT REGISTRY
// ═══════════════════════════════════════════════════════════

var REGISTRY = {

  // ── 1. NAVY COVER ────────────────────────────────────
  "navy_cover": {
    version: 3,
    label: "Navy Cover",
    description: "Full-bleed navy background with white title, subtitle, accent bar",
    archetype_usage: { accelerator: 45, incubator: 32, government_capability: 28, corporate_innovation: 35, soft_landing: 22, sandbox: 18, innovation_challenge: 20, ai_training: 15, executive_workshop: 12, venture_building: 25 },
    elements: [
      { id: "bg",      type: "RECTANGLE", role: "background",  x: 0,   y: 0,   w: 720, h: 540, fill: C.navy, z: 0 },
      { id: "deco",    type: "RECTANGLE", role: "decoration",  x: 540, y: 0,   w: 180, h: 180, fill: C.navyLight, z: 1 },
      { id: "title",   type: "TEXT_BOX",  role: "primary",     x: 50,  y: 170, w: 600, h: 70,  style: TYPE.coverTitle, z: 2 },
      { id: "subtitle",type: "TEXT_BOX",  role: "secondary",   x: 50,  y: 250, w: 400, h: 40,  style: TYPE.coverSub, z: 2 },
      { id: "accent",  type: "RECTANGLE", role: "divider",     x: 50,  y: 300, w: 100, h: 3,   fill: C.accent, z: 2 },
      { id: "context", type: "TEXT_BOX",  role: "body",        x: 50,  y: 320, w: 600, h: 60,  style: { fontSize: { magnitude: 12, unit: "PT" }, color: C.grayLight }, z: 2 },
      { id: "date",    type: "TEXT_BOX",  role: "caption",     x: 50,  y: 480, w: 300, h: 20,  style: { fontSize: { magnitude: 10, unit: "PT" }, color: C.grayLight }, z: 2 },
    ],
    spacing: { padding: { top: 170, left: 50, right: 50, bottom: 40 } },
    hierarchy: ["title", "subtitle", "accent", "context"],
    alignment: "left",
    variants: {
      minimal: { elements: ["bg", "title", "subtitle", "accent"] },
      expanded: { elements: ["bg", "deco", "title", "subtitle", "accent", "context", "date"] },
      dark: { bgFill: C.navyDark },
    },
  },

  // ── 2. TITLE SENTENCE ────────────────────────────────
  "title_sentence": {
    version: 3,
    label: "Title Sentence",
    description: "Single powerful sentence on light background with navy top bar",
    archetype_usage: { government_capability: 38, accelerator: 25, corporate_innovation: 28, incubator: 20, ai_training: 22, soft_landing: 18, sandbox: 15, innovation_challenge: 20, executive_workshop: 30, venture_building: 22 },
    elements: [
      { id: "bg",   type: "RECTANGLE", role: "background", x: 0,   y: 0,   w: 720, h: 540, fill: C.offWhite, z: 0 },
      { id: "topbar",type: "RECTANGLE",role: "accent_bar", x: 0,   y: 0,   w: 720, h: 6,   fill: C.navy, z: 1 },
      { id: "text", type: "TEXT_BOX",  role: "primary",    x: 60,  y: 140, w: 600, h: 200, style: TYPE.title, z: 2 },
      { id: "attr", type: "TEXT_BOX",  role: "caption",    x: 60,  y: 360, w: 300, h: 30,  style: { fontSize: { magnitude: 16, unit: "PT" }, color: C.gray }, z: 2 },
    ],
    spacing: { padding: { top: 140, left: 60, right: 60, bottom: 60 } },
    hierarchy: ["text"],
    alignment: "left",
    variants: {
      centered: { alignment: "center", textX: 60, textW: 600 },
      compact: { textY: 180, textH: 120 },
      statement: { style: { fontSize: { magnitude: 40, unit: "PT" } } },
    },
  },

  // ── 3. SECTION HEADER ────────────────────────────────
  "section_header": {
    version: 4,
    label: "Section Header",
    description: "Accent divider bar + heading + optional subtitle + body bullets",
    archetype_usage: { accelerator: 50, incubator: 40, government_capability: 45, corporate_innovation: 48, soft_landing: 35, sandbox: 38, innovation_challenge: 35, ai_training: 40, executive_workshop: 35, venture_building: 38 },
    elements: [
      { id: "bar",     type: "RECTANGLE", role: "divider",  x: 40, y: 42,  w: 80,  h: 4,   fill: C.accent, z: 1 },
      { id: "heading", type: "TEXT_BOX",  role: "primary",  x: 40, y: 48,  w: 620, h: 50,  style: TYPE.heading, z: 2 },
      { id: "sub",     type: "TEXT_BOX",  role: "secondary",x: 40, y: 98,  w: 620, h: 30,  style: TYPE.subheading, z: 2 },
      { id: "body",    type: "TEXT_BOX",  role: "body",     x: 40, y: 130, w: 620, h: 350, style: TYPE.body, z: 2 },
    ],
    spacing: { padding: { top: 48, left: 40, right: 40, bottom: 40 } },
    hierarchy: ["heading", "sub", "body"],
    alignment: "left",
    variants: {
      with_subtitle: { active: ["bar", "heading", "sub", "body"], bodyY: 130 },
      no_subtitle:   { active: ["bar", "heading", "body"], bodyY: 105 },
      compact:       { bodyH: 200 },
      expanded:      { bodyH: 400 },
    },
  },

  // ── 4. TWO COLUMN ────────────────────────────────────
  "two_column": {
    version: 5,
    label: "Two Column",
    description: "Vertical divider with two labeled columns of content",
    archetype_usage: { corporate_innovation: 35, accelerator: 25, incubator: 28, government_capability: 20, ai_training: 30, venture_building: 25, soft_landing: 18, sandbox: 22, innovation_challenge: 15, executive_workshop: 25 },
    elements: [
      { id: "bar",      type: "RECTANGLE", role: "divider",  x: 40, y: 42,  w: 80,  h: 4,   fill: C.accent, z: 1 },
      { id: "heading",  type: "TEXT_BOX",  role: "primary",  x: 40, y: 48,  w: 620, h: 50,  style: TYPE.heading, z: 2 },
      { id: "leftTitle",type: "TEXT_BOX",  role: "subheading",x:40, y: 105, w: 320, h: 30,  style: TYPE.subheading, z: 2 },
      { id: "leftBody", type: "TEXT_BOX",  role: "body",     x: 40, y: 140, w: 320, h: 350, style: TYPE.body, z: 2 },
      { id: "divider",  type: "RECTANGLE", role: "separator",x: 370,y: 105, w: 1,   h: 350, fill: C.grayLighter, z: 1 },
      { id: "rightTitle",type:"TEXT_BOX",  role: "subheading",x:390, y: 105, w: 300, h: 30,  style: TYPE.subheading, z: 2 },
      { id: "rightBody",type: "TEXT_BOX",  role: "body",     x: 390,y: 140, w: 300, h: 350, style: TYPE.body, z: 2 },
    ],
    spacing: { padding: { top: 48, left: 40, right: 40, bottom: 40 } },
    hierarchy: ["heading", "leftTitle", "leftBody", "rightTitle", "rightBody"],
    alignment: "left",
    variants: {
      consulting: { leftW: 320, rightW: 300, midX: 370 },
      equal:      { leftW: 310, rightW: 310, midX: 375 },
      wide_left:  { leftW: 380, rightW: 240, midX: 430 },
    },
  },

  // ── 5. METRICS GRID ──────────────────────────────────
  "metrics_grid": {
    version: 4,
    label: "Metrics Grid",
    description: "3-column grid of large metric numbers with labels underneath",
    archetype_usage: { accelerator: 30, government_capability: 32, corporate_innovation: 25, innovation_challenge: 20, incubator: 15, soft_landing: 12, sandbox: 10, ai_training: 8, executive_workshop: 5, venture_building: 15 },
    elements: [
      { id: "bar",   type: "RECTANGLE", role: "divider", x: 40, y: 42,  w: 80,  h: 4,   fill: C.accent, z: 1 },
      { id: "head",  type: "TEXT_BOX",  role: "primary", x: 40, y: 48,  w: 620, h: 50,  style: TYPE.heading, z: 2 },
      // 6 metric slots (3 cols x 2 rows)
      { id: "m0", type: "TEXT_BOX", role: "metric", x: 40,  y: 130, w: 200, h: 50, style: TYPE.metric, z: 2 },
      { id: "l0", type: "TEXT_BOX", role: "label",  x: 40,  y: 180, w: 200, h: 40, style: TYPE.metricLabel, z: 2 },
      { id: "m1", type: "TEXT_BOX", role: "metric", x: 260, y: 130, w: 200, h: 50, style: TYPE.metric, z: 2 },
      { id: "l1", type: "TEXT_BOX", role: "label",  x: 260, y: 180, w: 200, h: 40, style: TYPE.metricLabel, z: 2 },
      { id: "m2", type: "TEXT_BOX", role: "metric", x: 480, y: 130, w: 200, h: 50, style: TYPE.metric, z: 2 },
      { id: "l2", type: "TEXT_BOX", role: "label",  x: 480, y: 180, w: 200, h: 40, style: TYPE.metricLabel, z: 2 },
      { id: "m3", type: "TEXT_BOX", role: "metric", x: 40,  y: 290, w: 200, h: 50, style: TYPE.metric, z: 2 },
      { id: "l3", type: "TEXT_BOX", role: "label",  x: 40,  y: 340, w: 200, h: 40, style: TYPE.metricLabel, z: 2 },
      { id: "m4", type: "TEXT_BOX", role: "metric", x: 260, y: 290, w: 200, h: 50, style: TYPE.metric, z: 2 },
      { id: "l4", type: "TEXT_BOX", role: "label",  x: 260, y: 340, w: 200, h: 40, style: TYPE.metricLabel, z: 2 },
      { id: "m5", type: "TEXT_BOX", role: "metric", x: 480, y: 290, w: 200, h: 50, style: TYPE.metric, z: 2 },
      { id: "l5", type: "TEXT_BOX", role: "label",  x: 480, y: 340, w: 200, h: 40, style: TYPE.metricLabel, z: 2 },
    ],
    spacing: { cols: 3, colW: 200, colGap: 20, rowH: 140, startX: 40, startY: 130 },
    hierarchy: ["head", "metrics"],
    alignment: "left",
    variants: {
      dark:   { metricColor: C.white, labelColor: C.grayLight, bgFill: C.navy },
      light:  { metricColor: C.navy, labelColor: C.gray, bgFill: null },
      compact:{ rowH: 100 },
      4up:    { cols: 2, colW: 300 },
    },
  },

  // ── 6. TIMELINE ──────────────────────────────────────
  "timeline": {
    version: 2,
    label: "Timeline",
    description: "Horizontal timeline bar with node dots and phase labels",
    archetype_usage: { accelerator: 35, incubator: 20, corporate_innovation: 25, government_capability: 22, venture_building: 18, soft_landing: 15, sandbox: 20, innovation_challenge: 18, ai_training: 12, executive_workshop: 8 },
    elements: [
      { id: "bar",  type: "RECTANGLE", role: "divider", x: 40, y: 42,  w: 80,  h: 4,   fill: C.accent, z: 1 },
      { id: "head", type: "TEXT_BOX",  role: "primary", x: 40, y: 48,  w: 620, h: 50,  style: TYPE.heading, z: 2 },
      { id: "tlbar",type: "RECTANGLE", role: "timeline_bar", x: 40, y: 140, w: 640, h: 3,   fill: C.accent, z: 1 },
    ],
    // Nodes and labels are generated dynamically based on phase count
    nodeTemplate: { type: "RECTANGLE", role: "node", size: 15, fill: C.navy, z: 2 },
    labelTemplate:{ type: "TEXT_BOX",  role: "label", style: TYPE.timeline, z: 2 },
    spacing: { barY: 140, dotOffset: 6, labelY: 160, labelW: 120 },
    hierarchy: ["head", "timeline_bar", "nodes"],
    alignment: "left",
    variants: {
      standard: { nodeCount: 4 },
      detailed: { nodeCount: 6 },
      phased:   { nodeCount: 3, showDates: true },
    },
  },

  // ── 7. CASE STUDY CARD ───────────────────────────────
  "case_study_card": {
    version: 3,
    label: "Case Study Card",
    description: "Structured result with program name, metrics, and description",
    archetype_usage: { accelerator: 25, incubator: 20, corporate_innovation: 22, government_capability: 20, soft_landing: 18, venture_building: 18, innovation_challenge: 15, sandbox: 12, ai_training: 10, executive_workshop: 8 },
    elements: [
      { id: "bar", type: "RECTANGLE", role: "divider", x: 40, y: 42,  w: 80,  h: 4,   fill: C.accent, z: 1 },
      { id: "head",type: "TEXT_BOX",  role: "primary", x: 40, y: 48,  w: 620, h: 50,  style: TYPE.heading, z: 2 },
      { id: "sub", type: "TEXT_BOX",  role: "secondary",x:40, y: 98,  w: 620, h: 30,  style: { fontSize: { magnitude: 14, unit: "PT" }, color: C.gray }, z: 2 },
      { id: "body",type: "TEXT_BOX",  role: "body",    x: 40, y: 130, w: 620, h: 350, style: TYPE.body, z: 2 },
    ],
    spacing: { padding: { top: 48, left: 40, right: 40, bottom: 40 } },
    hierarchy: ["head", "sub", "body"],
    alignment: "left",
    variants: {
      with_metrics: { subActive: true },
      text_only:    { subActive: false, bodyY: 105 },
    },
  },
};

// ═══════════════════════════════════════════════════════════
//  COMPONENT FACTORY
//  Builds API requests from registry component definitions
// ═══════════════════════════════════════════════════════════

function buildComponentRequests(componentKey, slideId, content, variant) {
  var def = REGISTRY[componentKey];
  if (!def) return [];

  variant = variant || "default";
  var reqs = [];

  // Create slide first
  reqs.push({ createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } });

  // Build each element
  def.elements.forEach(function(el) {
    var elId = el.id + slideId.substring(1); // unique per slide

    if (el.type === "RECTANGLE") {
      reqs.push({ createShape: {
        objectId: elId,
        shapeType: "RECTANGLE",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: el.w, unit: "PT" }, height: { magnitude: el.h, unit: "PT" } },
          transform: { scaleX: 1, scaleY: 1, translateX: el.x, translateY: el.y, unit: "PT" },
        }
      }});
      if (el.fill) {
        reqs.push({ updateShapeProperties: {
          objectId: elId,
          shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: el.fill } } } },
          fields: "shapeBackgroundFill.solidFill.color"
        }});
      }
    } else if (el.type === "TEXT_BOX") {
      // Get content for this element role
      var text = getContentForRole(content, el.role, componentKey);
      reqs.push({ createShape: {
        objectId: elId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: el.w, unit: "PT" }, height: { magnitude: el.h, unit: "PT" } },
          transform: { scaleX: 1, scaleY: 1, translateX: el.x, translateY: el.y, unit: "PT" },
        }
      }});
      if (text) {
        reqs.push({ insertText: { objectId: elId, text: text } });
      }
      if (el.style) {
        var styleFields = [];
        if (el.style.bold !== undefined) styleFields.push("bold");
        if (el.style.fontSize) styleFields.push("fontSize");
        if (el.style.color) styleFields.push("foregroundColor");
        var apiStyle = {};
        if (el.style.bold !== undefined) apiStyle.bold = el.style.bold;
        if (el.style.fontSize) apiStyle.fontSize = el.style.fontSize;
        if (el.style.color) apiStyle.foregroundColor = { opaqueColor: { rgbColor: el.style.color } };
        reqs.push({ updateTextStyle: {
          objectId: elId,
          style: apiStyle,
          fields: styleFields.join(",")
        }});
      }
    }
  });

  return reqs;
}

function getContentForRole(content, role, componentKey) {
  if (!content) return "";
  switch (role) {
    case "primary":    return content.title || content.heading || "";
    case "secondary":  return content.subtitle || "";
    case "body":       return content.body ? content.body.join("\n") : "";
    case "caption":    return content.caption || "";
    default:           return "";
  }
}

// ═══════════════════════════════════════════════════════════
//  DECK COHERENCE ENGINE
//  Ensures visual continuity across multi-slide decks
// ═══════════════════════════════════════════════════════════

/**
 * Apply coherence rules to an assembly plan before building.
 * Ensures: typography rhythm, density pacing, adjacent-slide consistency.
 */
function applyCoherence(plan, archetype) {
  var rules = COMPONENT_RULES[archetype] || COMPONENT_RULES.accelerator;
  var rhythm = rules.rhythm || ["header", "content", "visual", "content", "next"];

  // Track source decks for adjacent-slide consistency
  var lastSourceDeck = null;
  var consecutiveFromSame = 0;

  plan.forEach(function(sec, idx) {
    // If this slide and the previous one come from the same source deck,
    // boost visual consistency by preferring the same component style
    if (sec.candidate && sec.candidate.sourceDeck) {
      if (sec.candidate.sourceDeck === lastSourceDeck) {
        consecutiveFromSame++;
        // If 2+ consecutive from same deck, mark for style preservation
        if (consecutiveFromSame >= 2) {
          sec.preserveStyle = true;
        }
      } else {
        consecutiveFromSame = 0;
      }
      lastSourceDeck = sec.candidate.sourceDeck;
    } else {
      consecutiveFromSame = 0;
      lastSourceDeck = null;
    }

    // Apply rhythm pattern: alternate visual intensity
    var rhythmIdx = idx % rhythm.length;
    var expectedIntensity = rhythm[rhythmIdx];
    sec.expectedIntensity = expectedIntensity;

    // Mark high-intensity slides (visual, data) for special handling
    sec.isHighIntensity = (expectedIntensity === "visual" || expectedIntensity === "data");
  });

  return plan;
}

// ═══════════════════════════════════════════════════════════
//  SLIDE LINEAGE TRACKING
//  Records every generated slide's ancestry and performance
// ═══════════════════════════════════════════════════════════

function createLineageRecord(section, presId, slideId, inputs) {
  return {
    timestamp: new Date().toISOString(),
    generationMode: section.source, // "cloned", "retrieved", "inspired", "generated"
    archetype: inputs.archetype || "",
    prospectCompany: inputs.prospectCompany || "",
    sectionType: section.type || "",
    sectionLabel: section.label || "",
    // Source tracking
    sourceSlideId: section.dna ? section.dna.slideId : null,
    sourceDeckId: section.dna ? section.dna.sourcePresentationId : null,
    sourceDeckName: section.dna ? section.dna.sourceDeck : null,
    // Scores
    combinedScore: section.score || 0,
    textScore: section.textScore || 0,
    visualScore: section.visualScore || 0,
    // Result
    finalPresentationId: presId || null,
    finalSlideId: slideId || null,
    // Inputs hash for deduplication
    inputsHash: hashInputs(inputs),
  };
}

function hashInputs(inputs) {
  var str = JSON.stringify({
    a: inputs.archetype,
    c: inputs.prospectCompany,
    o: inputs.offerings,
    g: inputs.geography,
  });
  // Simple hash
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(hash);
}

// ═══════════════════════════════════════════════════════════
//  GOLD STANDARD RANKING
//  Ranks historical slides by their success as retrieval sources
// ═══════════════════════════════════════════════════════════

function rankGoldStandard(lineageRecords) {
  var scores = {};

  lineageRecords.forEach(function(rec) {
    var key = rec.sourceSlideId || "generated_" + rec.sectionType;
    if (!scores[key]) {
      scores[key] = {
        slideId: rec.sourceSlideId,
        deckId: rec.sourceDeckId,
        deckName: rec.sourceDeckName,
        sectionType: rec.sectionType,
        totalUses: 0,
        cloneCount: 0,
        retrieveCount: 0,
        avgCombinedScore: 0,
        avgVisualScore: 0,
        scoreSum: 0,
        visualSum: 0,
        archetypes: {},
        lastUsed: null,
      };
    }

    var s = scores[key];
    s.totalUses++;
    s.scoreSum += rec.combinedScore;
    s.visualSum += rec.visualScore;
    if (rec.generationMode === "cloned") s.cloneCount++;
    if (rec.generationMode === "retrieved") s.retrieveCount++;
    s.archetypes[rec.archetype] = (s.archetypes[rec.archetype] || 0) + 1;
    s.lastUsed = rec.timestamp;
  });

  // Calculate averages and rank
  var ranked = Object.values(scores).map(function(s) {
    s.avgCombinedScore = s.totalUses > 0 ? Math.round(s.scoreSum / s.totalUses) : 0;
    s.avgVisualScore = s.totalUses > 0 ? Math.round(s.visualSum / s.totalUses) : 0;
    // Gold score: clones are worth 3x, retrieves 2x, high visual scores boost
    s.goldScore = s.cloneCount * 30 + s.retrieveCount * 20 + s.avgCombinedScore + s.avgVisualScore;
    return s;
  }).sort(function(a, b) { return b.goldScore - a.goldScore; });

  return ranked;
}

// ═══════════════════════════════════════════════════════════
//  PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════

function saveLineageToDrive(token, lineageRecord, logs) {
  return loadLineageFromDrive(token, logs).then(function(existing) {
    var records = existing || [];
    records.push(lineageRecord);
    // Keep last 500 records
    if (records.length > 500) records = records.slice(-500);

    return getOrCreateIndexesFolder(token).then(function(folderId) {
      var body = JSON.stringify({ records: records, updatedAt: new Date().toISOString() });
      return persistJSONFile(token, folderId, "slide_lineage.json", body, logs);
    });
  });
}

function loadLineageFromDrive(token, logs) {
  return getOrCreateIndexesFolder(token).then(function(folderId) {
    return loadJSONFile(token, folderId, "slide_lineage.json").then(function(data) {
      if (data && data.records) {
        logs.push("Loaded lineage: " + data.records.length + " records");
        return data.records;
      }
      return [];
    });
  }).catch(function() { return []; });
}

function saveRegistryToDrive(token, logs) {
  return getOrCreateIndexesFolder(token).then(function(folderId) {
    var body = JSON.stringify({ components: REGISTRY, updatedAt: new Date().toISOString() }, null, 2);
    return persistJSONFile(token, folderId, "component_registry.json", body, logs);
  });
}

function loadRegistryFromDrive(token, logs) {
  return getOrCreateIndexesFolder(token).then(function(folderId) {
    return loadJSONFile(token, folderId, "component_registry.json").then(function(data) {
      if (data && data.components) {
        logs.push("Loaded component registry: " + Object.keys(data.components).length + " components");
        return data.components;
      }
      logs.push("Using default component registry: " + Object.keys(REGISTRY).length + " components");
      return REGISTRY;
    });
  }).catch(function() { return REGISTRY; });
}

// ═══════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════

function getOrCreateIndexesFolder(token) {
  var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + process.env.GOOGLE_DRIVE_FOLDER_ID + "' in parents and name='06 Indexes' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    if (search.files && search.files[0]) return search.files[0].id;
    return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "06 Indexes", mimeType: "application/vnd.google-apps.folder", parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] }),
    }).then(function(r) { return r.json(); }).then(function(f) { return f.id; });
  });
}

function persistJSONFile(token, folderId, filename, body, logs) {
  var q = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='" + filename + "' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    var existingId = search.files && search.files[0] ? search.files[0].id : null;
    if (existingId) {
      return fetch("https://www.googleapis.com/upload/drive/v3/files/" + existingId + "?uploadType=media&supportsAllDrives=true", {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: body,
      }).then(function() { logs.push("Updated " + filename); });
    } else {
      var metadata = { name: filename, mimeType: "application/json", parents: [folderId] };
      var form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new Blob([body], { type: "application/json" }));
      return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: form,
      }).then(function() { logs.push("Created " + filename); });
    }
  });
}

function loadJSONFile(token, folderId, filename) {
  var q = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='" + filename + "' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    if (!search.files || search.files.length === 0) return null;
    return fetch("https://www.googleapis.com/drive/v3/files/" + search.files[0].id + "?alt=media&supportsAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); });
  });
}

// ── Exports ───────────────────────────────────────────────

export {
  REGISTRY,
  C, TYPE, SPACING,
  buildComponentRequests,
  getContentForRole,
  applyCoherence,
  createLineageRecord,
  rankGoldStandard,
  saveLineageToDrive,
  loadLineageFromDrive,
  saveRegistryToDrive,
  loadRegistryFromDrive,
};
