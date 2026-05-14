const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// ═══════════════════════════════════════════════════════════
//  BRINC RETRIEVAL-FIRST SLIDES ASSEMBLER
//  Self-contained: no external imports for Vercel compat
// ═══════════════════════════════════════════════════════════

// ── Archetype Data ────────────────────────────────────────

var ARCHETYPES = {
  accelerator: {
    label: "Accelerator Program",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_framing","objectives","ecosystem","approach","scouting","startup_support","pilot_execution","commercialization","timeline","case_study","why_brinc","next_steps"],
    signals: ["accelerator","cohort","startup","batch","program","founder","mentor"]
  },
  incubator: {
    label: "Incubator / Venture Building",
    sectionOrder: ["cover","title_sentence","executive_summary","opportunity","approach","venture_building","scouting","pilot_execution","commercialization","timeline","case_study","team","next_steps"],
    signals: ["incubator","venture building","studio","idea validation","mvp","launch"]
  },
  soft_landing: {
    label: "Soft Landing / Market Entry",
    sectionOrder: ["cover","title_sentence","executive_summary","market_opportunity","ecosystem","approach","scouting","startup_support","commercialization","timeline","case_study","why_brinc","next_steps"],
    signals: ["soft landing","market entry","gcc","uae","localize","expand"]
  },
  sandbox: {
    label: "Sandbox / Regulator Program",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_framing","regulatory_context","approach","scouting","pilot_execution","reporting","timeline","case_study","team","next_steps"],
    signals: ["sandbox","regulator","compliance","regulatory","fintech","license"]
  },
  innovation_challenge: {
    label: "Innovation Challenge",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_statement","approach","scouting","selection","startup_support","pilot_execution","awards","timeline","case_study","next_steps"],
    signals: ["challenge","hackathon","competition","prize","solve","contest"]
  },
  corporate_innovation: {
    label: "Corporate Innovation",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_framing","objectives","approach","scouting","startup_support","pilot_execution","commercialization","reporting","case_study","why_brinc","next_steps"],
    signals: ["corporate","enterprise","innovation lab","transform","digital"]
  },
  ai_training: {
    label: "AI / Corporate Training",
    sectionOrder: ["cover","title_sentence","executive_summary","why_now","ecosystem","approach","curriculum","timeline","case_study","team","next_steps"],
    signals: ["ai","artificial intelligence","training","workshop","capacity building","upskill"]
  },
  government_capability: {
    label: "Government Capability Building",
    sectionOrder: ["cover","title_sentence","executive_summary","strategic_context","objectives","approach","ecosystem","scouting","startup_support","reporting","case_study","why_brinc","next_steps"],
    signals: ["government","ministry","department","authority","capacity","smart city","vision 2030"]
  },
  executive_workshop: {
    label: "Executive Workshop",
    sectionOrder: ["cover","title_sentence","objectives","agenda","approach","case_study","next_steps"],
    signals: ["workshop","executive","board","stakeholder","session","strategy"]
  },
  venture_building: {
    label: "Venture Building",
    sectionOrder: ["cover","title_sentence","executive_summary","opportunity","approach","venture_building","scouting","pilot_execution","commercialization","timeline","case_study","team","next_steps"],
    signals: ["venture","venture building","co-creation","studio","spin out"]
  }
};

var SLIDE_TYPE_SIGNALS = {
  cover: ["brinc","proposal","partnership","confidential"],
  title_sentence: ["title","opportunity","building","creating","enabling","launching"],
  executive_summary: ["executive summary","overview","at a glance","snapshot"],
  challenge_framing: ["challenge","problem","gap","obstacle","barrier"],
  objectives: ["objective","goal","aim","target","kpi","outcome"],
  why_now: ["why now","timely","urgency","momentum","window"],
  ecosystem: ["ecosystem","landscape","market","players","stakeholders"],
  approach: ["approach","methodology","how we work","process","framework"],
  phased_roadmap: ["roadmap","phases","stage","milestone"],
  timeline: ["timeline","schedule","calendar","milestone"],
  funnel: ["funnel","pipeline","intake","screen","select"],
  scouting: ["scouting","sourcing","selection","screening","deal flow"],
  startup_support: ["support","mentor","coach","founder","resources"],
  pilot_execution: ["pilot","execution","test","trial","proof of concept"],
  commercialization: ["commercial","revenue","go-to-market","scale","deployment"],
  case_study: ["case study","portfolio","track record","success"],
  reporting: ["reporting","kpi","dashboard","metrics","track"],
  team: ["team","leadership","people","expert","advisor"],
  why_brinc: ["why brinc","differentiator","advantage","unique","track record"],
  next_steps: ["next step","action","get started","moving forward"],
  market_opportunity: ["market","tam","sam","opportunity","growth"],
  regulatory_context: ["regulatory","regulation","compliance","license"],
  opportunity: ["opportunity","market","potential","gap"],
  venture_building: ["venture building","co-creation","build"],
  challenge_statement: ["challenge","problem statement","solve"],
  awards: ["prize","award","winner","incentive","reward"],
  curriculum: ["curriculum","module","syllabus","learning"],
  strategic_context: ["strategic","vision","d33","national","agenda"]
};

// ── Color System ────────────────────────────────────────

var COLORS = {
  navy:          { red: 0.105, green: 0.164, blue: 0.290 },
  navyLight:     { red: 0.160, green: 0.240, blue: 0.380 },
  white:         { red: 1.000, green: 1.000, blue: 1.000 },
  gray:          { red: 0.330, green: 0.330, blue: 0.330 },
  lightGray:     { red: 0.550, green: 0.550, blue: 0.550 },
  veryLightGray: { red: 0.920, green: 0.920, blue: 0.920 },
  accent:        { red: 0.200, green: 0.400, blue: 0.700 },
  accentLight:   { red: 0.350, green: 0.550, blue: 0.850 },
};

function navyText(size) { return { bold: true, fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.navy } } }; }
function whiteText(size) { return { bold: true, fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.white } } }; }
function grayText(size) { return { fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.gray } } }; }
function lightGrayText(size) { return { fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.lightGray } } }; }

// ── HTTP Helper ───────────────────────────────────────────

function gapi(token, url, init) {
  return fetch(url, Object.assign({}, init, {
    headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
  })).then(function(r) {
    return r.text().then(function(t) { return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} }; });
  });
}

function textBox(id, pageId, x, y, w, h, text, style, fields) {
  var reqs = [];
  reqs.push({ createShape: {
    objectId: id, shapeType: "TEXT_BOX",
    elementProperties: { pageObjectId: pageId, size: { width: { magnitude: w, unit: "PT" }, height: { magnitude: h, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "PT" } } }
  });
  if (text) reqs.push({ insertText: { objectId: id, text: text } });
  if (style) reqs.push({ updateTextStyle: { objectId: id, style: style, fields: fields || "bold,fontSize,foregroundColor" } });
  return reqs;
}

function rectangle(id, pageId, x, y, w, h, color) {
  var reqs = [];
  reqs.push({ createShape: {
    objectId: id, shapeType: "RECTANGLE",
    elementProperties: { pageObjectId: pageId, size: { width: { magnitude: w, unit: "PT" }, height: { magnitude: h, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "PT" } } }
  });
  if (color) {
    reqs.push({ updateShapeProperties: {
      objectId: id,
      shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: color } } } },
      fields: "shapeBackgroundFill.solidFill.color"
    } });
  }
  return reqs;
}

function accentBar(pageId, x, y) {
  return rectangle("bar" + pageId.substring(1), pageId, x, y, 80, 4, COLORS.accent);
}

// ── Slide Section Builders ────────────────────────────────

function buildCover(sid, co, angle) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(rectangle("bg" + sid, sid, 0, 0, 720, 540, COLORS.navy));
  r = r.concat(rectangle("deca" + sid, sid, 540, 0, 180, 180, COLORS.navyLight));
  r = r.concat(textBox("t" + sid, sid, 50, 170, 600, 70, co || "Partner", whiteText(42), "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("st" + sid, sid, 50, 250, 400, 40, "x Brinc", lightGrayText(22), "fontSize,foregroundColor"));
  r = r.concat(rectangle("cab" + sid, sid, 50, 300, 100, 3, COLORS.accent));
  if (angle) {
    var ctx = angle.split("\n").filter(Boolean).slice(0, 2).join("\n");
    r = r.concat(textBox("ctx" + sid, sid, 50, 320, 600, 60, ctx, lightGrayText(12), "fontSize,foregroundColor"));
  }
  var dateStr = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  r = r.concat(textBox("dt" + sid, sid, 50, 480, 300, 20, dateStr, lightGrayText(10), "fontSize,foregroundColor"));
  return r;
}

function buildTitleSentence(sid, text) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(rectangle("tsbg" + sid, sid, 0, 0, 720, 540, COLORS.veryLightGray));
  r = r.concat(rectangle("tsbar" + sid, sid, 0, 0, 720, 6, COLORS.navy));
  r = r.concat(textBox("tst" + sid, sid, 60, 140, 600, 200, text, navyText(36), "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("tsa" + sid, sid, 60, 360, 300, 30, "\u2014 Brinc", grayText(16), "fontSize,foregroundColor"));
  return r;
}

function buildSectionHeader(sid, title, subtitle, bullets) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(accentBar(sid, 40, 42));
  r = r.concat(textBox("ht" + sid, sid, 40, 48, 620, 50, title, navyText(28), "bold,fontSize,foregroundColor"));
  if (subtitle) {
    r = r.concat(textBox("hs" + sid, sid, 40, 98, 620, 30, subtitle, grayText(14), "fontSize,foregroundColor"));
  }
  if (bullets && bullets.length > 0) {
    var body = bullets.join("\n");
    var h = Math.min(350, Math.max(120, bullets.length * 28));
    r = r.concat(textBox("hb" + sid, sid, 40, subtitle ? 130 : 105, 620, h, body, grayText(13), "fontSize,foregroundColor"));
  }
  return r;
}

function buildTwoColumn(sid, title, leftTitle, leftItems, rightTitle, rightItems) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(accentBar(sid, 40, 42));
  r = r.concat(textBox("ht" + sid, sid, 40, 48, 620, 50, title, navyText(28), "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("lt" + sid, sid, 40, 105, 320, 30, leftTitle, { bold: true, fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.accent } } }, "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("lb" + sid, sid, 40, 140, 320, 350, leftItems.join("\n"), grayText(12), "fontSize,foregroundColor"));
  r = r.concat(rectangle("div" + sid, sid, 370, 105, 1, 350, COLORS.lightGray));
  r = r.concat(textBox("rt" + sid, sid, 390, 105, 300, 30, rightTitle, { bold: true, fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.accent } } }, "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("rb" + sid, sid, 390, 140, 300, 350, rightItems.join("\n"), grayText(12), "fontSize,foregroundColor"));
  return r;
}

function buildTimeline(sid, title, phases) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(accentBar(sid, 40, 42));
  r = r.concat(textBox("ht" + sid, sid, 40, 48, 620, 50, title, navyText(28), "bold,fontSize,foregroundColor"));
  r = r.concat(rectangle("tlbar" + sid, sid, 40, 140, 640, 3, COLORS.accent));
  var startX = 50;
  var step = phases.length > 1 ? 580 / (phases.length - 1) : 580;
  phases.forEach(function(phase, i) {
    var x = startX + step * i;
    r = r.concat(rectangle("tld" + sid + "_" + i, sid, x, 134, 15, 15, COLORS.navy));
    r = r.concat(textBox("tll" + sid + "_" + i, sid, x - 30, 160, 120, 60, phase, grayText(10), "fontSize,foregroundColor"));
  });
  return r;
}

function buildMetrics(sid, title, metrics) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(accentBar(sid, 40, 42));
  r = r.concat(textBox("ht" + sid, sid, 40, 48, 620, 50, title, navyText(28), "bold,fontSize,foregroundColor"));
  var cols = 3, colW = 200, startX = 40, startY = 130;
  metrics.forEach(function(m, i) {
    var col = i % cols, row = Math.floor(i / cols);
    var x = startX + col * (colW + 20), y = startY + row * 140;
    r = r.concat(textBox("mn" + sid + "_" + i, sid, x, y, colW, 50, m.value || "\u2014", { bold: true, fontSize: { magnitude: 36, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.navy } } }, "bold,fontSize,foregroundColor"));
    r = r.concat(textBox("ml" + sid + "_" + i, sid, x, y + 50, colW, 40, m.label || "", grayText(12), "fontSize,foregroundColor"));
  });
  return r;
}

// ── Retrieval Engine (inlined) ────────────────────────────

function classifySlideType(texts) {
  var fullText = texts.join(" ").toLowerCase();
  var best = null, bestScore = 0;
  for (var key in SLIDE_TYPE_SIGNALS) {
    var score = 0;
    SLIDE_TYPE_SIGNALS[key].forEach(function(s) { if (fullText.includes(s)) score += 3; });
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best || "content";
}

function scoreCandidate(candidate, query) {
  var score = 0, maxScore = 0;

  // Slide type match (25)
  if (candidate.slideType === query.slideType) score += 25;
  maxScore += 25;

  // Archetype match (20)
  if (candidate.archetype === query.archetype) score += 20;
  maxScore += 20;

  // Keyword overlap (20)
  if (query.keywords && query.keywords.length > 0 && candidate.text) {
    var cText = candidate.text.toLowerCase();
    var matches = 0;
    query.keywords.forEach(function(kw) { if (cText.includes(kw.toLowerCase())) matches++; });
    score += Math.floor(20 * matches / query.keywords.length);
  }
  maxScore += 20;

  // Geography (15)
  if (query.geography && candidate.text) {
    var geo = query.geography.toLowerCase();
    var signals = { "uae": ["uae","dubai","abu dhabi","emirates"], "gcc": ["gcc","saudi","ksa","bahrain","oman","kuwait","qatar"] };
    var geoList = signals[geo] || [geo];
    if (geoList.some(function(s) { return candidate.text.toLowerCase().includes(s); })) score += 15;
  }
  maxScore += 15;

  // Offerings (15)
  if (query.offerings && query.offerings.length > 0 && candidate.text) {
    var cText2 = candidate.text.toLowerCase();
    var offMatches = 0;
    query.offerings.forEach(function(off) {
      off.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; }).forEach(function(w) { if (cText2.includes(w)) offMatches++; });
    });
    score += Math.min(15, Math.floor(15 * offMatches / query.offerings.length));
  }
  maxScore += 15;

  // Recency (5)
  if (candidate.modifiedTime) {
    var age = (Date.now() - new Date(candidate.modifiedTime).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (age < 3) score += 5; else if (age < 6) score += 3; else if (age < 12) score += 1;
  }
  maxScore += 5;

  return maxScore > 0 ? Math.floor(score * 100 / maxScore) : 0;
}

function retrieveSlides(slideIndex, query, topN) {
  topN = topN || 3;
  if (!slideIndex || !slideIndex.slides || slideIndex.slides.length === 0) {
    return { hasIndex: false, candidates: [] };
  }
  var scored = slideIndex.slides.map(function(s) {
    return Object.assign({}, s, { score: scoreCandidate(s, query) });
  }).filter(function(s) { return s.score >= 35; }).sort(function(a, b) { return b.score - a.score; }).slice(0, topN);

  return {
    hasIndex: true,
    candidates: scored.map(function(s) { return { score: s.score, slideType: s.slideType, archetype: s.archetype, text: s.text ? s.text.substring(0, 200) : "", sourceDeck: s.sourceDeck, modifiedTime: s.modifiedTime }; })
  };
}

function buildAssemblyPlan(slideIndex, dnaIndex, archetype, offerings, geography) {
  var arch = ARCHETYPES[archetype] || ARCHETYPES.accelerator;
  var rules = COMPONENT_RULES[archetype] || COMPONENT_RULES.accelerator;
  var plan = [];

  arch.sectionOrder.forEach(function(sectionType, idx) {
    var query = { slideType: sectionType, archetype: archetype, keywords: SLIDE_TYPE_SIGNALS[sectionType] || [], geography: geography, offerings: offerings };

    // 1. Text-based retrieval
    var result = retrieveSlides(slideIndex, query, 3);
    var textScore = result.hasIndex && result.candidates.length > 0 ? result.candidates[0].score : 0;
    var bestCandidate = result.hasIndex && result.candidates.length > 0 ? result.candidates[0] : null;

    // 2. Visual similarity from DNA index
    var visualScore = 0;
    var bestDNA = null;
    if (dnaIndex && dnaIndex.slides && dnaIndex.slides.length > 0) {
      // Find DNA entries matching this section type
      var matchingDNA = dnaIndex.slides.filter(function(d) { return d.slideType === sectionType; });
      if (matchingDNA.length > 0) {
        // Score against a synthetic reference (what we'd generate)
        var refDNA = buildReferenceDNA(sectionType, archetype);
        var scored = matchingDNA.map(function(d) {
          return { dna: d, vScore: scoreVisualSimilarity(refDNA, d) };
        }).sort(function(a, b) { return b.vScore - a.vScore; });
        visualScore = scored[0].vScore;
        bestDNA = scored[0].dna;
        if (bestDNA && (!bestCandidate || bestDNA.text)) {
          bestCandidate = bestCandidate || {};
          bestCandidate.text = bestCandidate.text || (bestDNA.text ? bestDNA.text.substring(0, 300) : "");
          bestCandidate.sourceDeck = bestCandidate.sourceDeck || bestDNA.sourceDeck;
          bestCandidate.sourcePresentationId = bestDNA.sourcePresentationId || "";
          bestCandidate.sourceSlideId = bestDNA.slideId || "";
        }
      }
    }

    // 3. Combined score (70% text, 30% visual)
    var combinedScore = Math.floor(textScore * 0.7 + visualScore * 0.3);

    // 4. Determine source based on combined score
    // Clone threshold: 70+ with source presentation available
    if (combinedScore >= 70 && bestDNA && bestDNA.sourcePresentationId) {
      plan.push({ type: sectionType, label: sectionType.replace(/_/g, " "), source: "cloned", score: combinedScore, textScore: textScore, visualScore: visualScore, candidate: bestCandidate, dna: bestDNA });
    } else if (combinedScore >= 55) {
      plan.push({ type: sectionType, label: sectionType.replace(/_/g, " "), source: "retrieved", score: combinedScore, textScore: textScore, visualScore: visualScore, candidate: bestCandidate, dna: bestDNA });
    } else if (combinedScore >= 35) {
      plan.push({ type: sectionType, label: sectionType.replace(/_/g, " "), source: "inspired", score: combinedScore, textScore: textScore, visualScore: visualScore, candidate: bestCandidate, dna: bestDNA });
    } else {
      plan.push({ type: sectionType, label: sectionType.replace(/_/g, " "), source: "generated", score: combinedScore, textScore: 0, visualScore: 0, candidate: null, dna: null });
    }
  });
  return plan;
}

/**
 * Build a reference DNA for a section type to compare against historical slides.
 */
function buildReferenceDNA(sectionType, archetype) {
  var componentMap = {
    cover: { elementCount: 6, textElementCount: 4, hasDivider: true, hasImage: false, avgFontSize: 22 },
    title_sentence: { elementCount: 4, textElementCount: 2, hasDivider: false, hasImage: false, avgFontSize: 30 },
    executive_summary: { elementCount: 5, textElementCount: 4, hasDivider: true, hasImage: false, avgFontSize: 14 },
    approach: { elementCount: 8, textElementCount: 6, hasDivider: true, hasImage: false, avgFontSize: 13 },
    timeline: { elementCount: 10, textElementCount: 5, hasDivider: true, hasImage: false, avgFontSize: 11 },
    metrics_grid: { elementCount: 10, textElementCount: 8, hasDivider: true, hasImage: false, avgFontSize: 20 },
    case_study: { elementCount: 6, textElementCount: 5, hasDivider: true, hasImage: false, avgFontSize: 13 },
    why_brinc: { elementCount: 10, textElementCount: 8, hasDivider: true, hasImage: false, avgFontSize: 18 },
  };
  var fp = componentMap[sectionType] || { elementCount: 5, textElementCount: 4, hasDivider: true, hasImage: false, avgFontSize: 14 };
  var compType = sectionType === "cover" ? "navy_cover" : sectionType === "title_sentence" ? "title_sentence" : sectionType === "timeline" ? "timeline" : sectionType === "why_brinc" ? "metrics_grid" : sectionType === "approach" ? "two_column" : "section_header";
  return {
    slideType: sectionType,
    archetype: archetype,
    layoutFingerprint: fp,
    detectedComponents: [{ type: compType, confidence: 0.8 }],
  };
}

// ── Deck Coherence Engine ─────────────────────────────────

function applyCoherence(plan, archetype) {
  var rhythmMap = {
    accelerator: ["header", "content", "visual", "content", "data", "content", "next"],
    incubator: ["header", "content", "content", "visual", "content", "next"],
    soft_landing: ["header", "content", "visual", "content", "data", "next"],
    sandbox: ["header", "content", "content", "data", "content", "next"],
    innovation_challenge: ["header", "visual", "content", "data", "content", "next"],
    corporate_innovation: ["header", "content", "visual", "content", "data", "next"],
    ai_training: ["header", "content", "content", "visual", "next"],
    government_capability: ["sentence", "header", "visual", "content", "data", "content", "next"],
    executive_workshop: ["header", "content", "content", "next"],
    venture_building: ["header", "content", "visual", "content", "next"],
  };
  var rhythm = rhythmMap[archetype] || rhythmMap.accelerator;
  var lastSourceDeck = null;
  var consecutiveFromSame = 0;

  plan.forEach(function(sec, idx) {
    // Adjacent-slide source consistency
    if (sec.candidate && sec.candidate.sourceDeck) {
      if (sec.candidate.sourceDeck === lastSourceDeck) {
        consecutiveFromSame++;
        if (consecutiveFromSame >= 2) sec.preserveStyle = true;
      } else {
        consecutiveFromSame = 0;
      }
      lastSourceDeck = sec.candidate.sourceDeck;
    } else {
      consecutiveFromSame = 0;
      lastSourceDeck = null;
    }

    // Rhythm intensity
    var rhythmIdx = idx % rhythm.length;
    sec.expectedIntensity = rhythm[rhythmIdx];
    sec.isHighIntensity = (rhythm[rhythmIdx] === "visual" || rhythm[rhythmIdx] === "data");
  });

  return plan;
}

// ── Slide Lineage Tracking ────────────────────────────────

function createLineageRecord(section, presId, inputs) {
  return {
    timestamp: new Date().toISOString(),
    generationMode: section.source,
    archetype: inputs.archetype || "",
    prospectCompany: inputs.prospectCompany || "",
    sectionType: section.type || "",
    sectionLabel: section.label || "",
    sourceSlideId: section.dna ? section.dna.slideId : null,
    sourceDeckId: section.dna ? section.dna.sourcePresentationId : null,
    sourceDeckName: section.dna ? section.dna.sourceDeck : null,
    combinedScore: section.score || 0,
    textScore: section.textScore || 0,
    visualScore: section.visualScore || 0,
    finalPresentationId: presId || null,
  };
}

function saveLineage(token, lineageRecords, logs) {
  var folderQ = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='06 Indexes' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + folderQ + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    var folderId = search.files && search.files[0] ? search.files[0].id : null;
    if (!folderId) return;
    var q = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='slide_lineage.json' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search2) {
      var existing = search2.files && search2.files[0] ? search2.files[0].id : null;
      var body = JSON.stringify({ records: lineageRecords, updatedAt: new Date().toISOString() });
      if (existing) {
        return fetch("https://www.googleapis.com/upload/drive/v3/files/" + existing + "?uploadType=media&supportsAllDrives=true", {
          method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body,
        }).then(function() { logs.push("Saved " + lineageRecords.length + " lineage records"); });
      } else {
        var metadata = { name: "slide_lineage.json", mimeType: "application/json", parents: [folderId] };
        var form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", new Blob([body], { type: "application/json" }));
        return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
          method: "POST", headers: { Authorization: "Bearer " + token }, body: form,
        }).then(function() { logs.push("Created lineage file with " + lineageRecords.length + " records"); });
      }
    });
  }).catch(function(err) { logs.push("Lineage save error: " + err.message); });
}

function adaptRetrievedContent(originalText, prospectCompany, offerings, geography) {
  if (!originalText) return "";
  var adapted = originalText;
  var co = prospectCompany || "Partner";
  var geo = geography || "the region";
  adapted = adapted.replace(/\b(?:Client|Partner|Customer|Prospect)\b/g, co);
  adapted = adapted.replace(/\[CLIENT\]/g, co);
  adapted = adapted.replace(/\[PARTNER\]/g, co);
  var currentYear = new Date().getFullYear();
  adapted = adapted.replace(/\b20[0-2][0-9]\b/g, function(m) { var y = parseInt(m); return y < currentYear - 2 ? String(currentYear) : m; });
  return adapted;
}

function loadIndexFromDrive(token, logs) {
  // Find 06 Indexes folder
  var q1 = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='06 Indexes' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q1 + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    if (!search.files || search.files.length === 0) {
      logs.push("No 06 Indexes folder — will generate synthetically");
      return null;
    }
    var folderId = search.files[0].id;
    var q2 = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='slide_index.json' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q2 + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search2) {
      if (!search2.files || search2.files.length === 0) {
        logs.push("No slide index file — will generate synthetically");
        return null;
      }
      var fileId = search2.files[0].id;
      return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true", {
        headers: { Authorization: "Bearer " + token }
      }).then(function(r) { return r.json(); }).then(function(index) {
        logs.push("Loaded index: " + (index.slides || []).length + " slides");
        return index;
      });
    });
  }).catch(function(err) {
    logs.push("Index load error: " + err.message);
    return null;
  });
}

// ── DNA Index Loading ─────────────────────────────────────

function loadDNAIndexFromDrive(token, logs) {
  var q1 = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='06 Indexes' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q1 + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    if (!search.files || search.files.length === 0) { logs.push("No 06 Indexes folder — DNA unavailable"); return null; }
    var folderId = search.files[0].id;
    var q2 = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='slide_dna.json' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q2 + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search2) {
      if (!search2.files || search2.files.length === 0) { logs.push("No DNA index — visual scoring unavailable"); return null; }
      var fileId = search2.files[0].id;
      return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true", {
        headers: { Authorization: "Bearer " + token }
      }).then(function(r) { return r.json(); }).then(function(dna) {
        logs.push("Loaded DNA: " + (dna.slides || []).length + " slides");
        return dna;
      });
    });
  }).catch(function(err) { logs.push("DNA load error: " + err.message); return null; });
}

// ── Visual Similarity Scoring ────────────────────────────

function scoreVisualSimilarity(dnaA, dnaB) {
  if (!dnaA || !dnaB || !dnaA.layoutFingerprint || !dnaB.layoutFingerprint) return 0;
  var fpA = dnaA.layoutFingerprint, fpB = dnaB.layoutFingerprint;
  var score = 0, maxScore = 0;
  // Element count (15)
  var countDiff = Math.abs(fpA.elementCount - fpB.elementCount);
  score += Math.max(0, 15 - countDiff * 3); maxScore += 15;
  // Has divider match (10)
  if (fpA.hasDivider === fpB.hasDivider) { score += 10; } maxScore += 10;
  // Has image match (10)
  if (fpA.hasImage === fpB.hasImage) { score += 10; } maxScore += 10;
  // Avg font size (10)
  var fontDiff = Math.abs(fpA.avgFontSize - fpB.avgFontSize);
  score += Math.max(0, 10 - fontDiff); maxScore += 10;
  // Text element count (10)
  var textDiff = Math.abs(fpA.textElementCount - fpB.textElementCount);
  score += Math.max(0, 10 - textDiff * 2); maxScore += 10;
  // Component overlap (25)
  if (dnaA.detectedComponents && dnaB.detectedComponents) {
    var sigA = dnaA.detectedComponents.map(function(c) { return c.type; });
    var sigB = dnaB.detectedComponents.map(function(c) { return c.type; });
    var shared = sigA.filter(function(s) { return sigB.indexOf(s) >= 0; });
    score += shared.length > 0 ? 25 : 0;
  }
  maxScore += 25;
  return maxScore > 0 ? Math.floor(score * 100 / maxScore) : 0;
}

// ── Archetype Component Rules ────────────────────────────

var COMPONENT_RULES = {
  accelerator:      { preferred: ["timeline","metrics_grid","two_column","case_study_card"], rhythm: ["header","content","visual","content","data","content","next"] },
  incubator:        { preferred: ["two_column","section_header","case_study_card"], rhythm: ["header","content","content","visual","content","next"] },
  soft_landing:     { preferred: ["section_header","two_column"], rhythm: ["header","content","visual","content","data","next"] },
  sandbox:          { preferred: ["two_column","section_header"], rhythm: ["header","content","content","data","content","next"] },
  innovation_challenge: { preferred: ["metrics_grid","timeline","case_study_card"], rhythm: ["header","visual","content","data","content","next"] },
  corporate_innovation: { preferred: ["two_column","section_header"], rhythm: ["header","content","visual","content","data","next"] },
  ai_training:      { preferred: ["section_header","two_column"], rhythm: ["header","content","content","visual","next"] },
  government_capability: { preferred: ["section_header","metrics_grid"], rhythm: ["sentence","header","visual","content","data","content","next"] },
  executive_workshop: { preferred: ["section_header","two_column"], rhythm: ["header","content","content","next"] },
  venture_building: { preferred: ["two_column","section_header","case_study_card"], rhythm: ["header","content","visual","content","next"] },
};

// ── Template Cloning ──────────────────────────────────────

/**
 * Build a copySlide request to physically clone a historical slide.
 * The source presentation must be a Google Slides file accessible to the user.
 */
function buildCloneSlideRequest(newSlideId, sourcePresentationId, sourceSlideId) {
  return {
    copySlide: {
      objectId: newSlideId,
      sourceObjectId: sourceSlideId,
      sourcePresentationId: sourcePresentationId,
    }
  };
}

// ── Synthetic Content Generator ───────────────────────────

function generateSyntheticContent(type, co, offerings, angle, geo) {
  switch (type) {
    case "cover": return { builder: buildCover, args: [co, angle] };
    case "title_sentence": {
      var p = ["Building a " + (offerings[0] || "transformative program") + " with " + co + " to accelerate innovation", "Partnering with " + co + " to launch a " + (geo || "regional") + " innovation program", "Co-creating an innovation ecosystem with " + co];
      return { builder: buildTitleSentence, args: [p[Math.floor(Math.random() * p.length)]] };
    }
    case "executive_summary": return { builder: buildSectionHeader, args: ["Executive Summary", "A partnership between " + co + " and Brinc", ["Program: " + (offerings[0] || "Innovation program"), "Approach: " + offerings.join(", "), "Outcome: Measurable innovation outcomes"]] };
    case "challenge_framing": return { builder: buildSectionHeader, args: ["The Opportunity", co + " has a strategic opportunity to accelerate innovation", ["Strong demand for " + (offerings[0] || "innovation") + " in " + (geo || "the region"), "Structured programs deliver 3-5x faster commercialization", "Brinc: 75+ programs, 170+ portfolio companies, $1.69B+ valuation"]] };
    case "objectives": return { builder: buildSectionHeader, args: ["Program Objectives", null, ["1. Launch " + (offerings[0] || "program"), "2. Source top-tier startups for " + co, "3. Execute pilots with measurable outcomes", "4. Build sustainable innovation capabilities"]] };
    case "approach": return { builder: buildTwoColumn, args: ["Our Approach", "Discovery & Design", ["Diagnostic assessment", "Program co-design", "Stakeholder alignment", "Success criteria"], "Execution & Scale", ["Startup scouting", "Pilot sprint execution", "Commercialization support", "Knowledge transfer"]] };
    case "scouting": return { builder: buildSectionHeader, args: ["Startup Scouting & Selection", "A rigorous, data-driven process", ["Global sourcing through 20+ countries", "Multi-channel: events, referrals, partnerships", "Data-driven via VentureVerse", "Target: Top 1-3% of applicants"]] };
    case "startup_support": return { builder: buildTwoColumn, args: ["Startup Support Services", "Program Support", ["1:1 mentorship", "Fundraising & investor intros", "Commercial pilot design", "Product guidance"], "Platform & Tools", ["VentureVerse analytics", "Progress tracking", "Portfolio management", "Reporting & KPIs"]] };
    case "pilot_execution": return { builder: buildSectionHeader, args: ["Pilot Execution Framework", "Structured sprints with clear success criteria", ["12-16 week pilot sprints with milestones", "Success criteria with measurable KPIs", "Regular reviews and stakeholder sessions", "Go/no-go framework at each gate"]] };
    case "commercialization": return { builder: buildSectionHeader, args: ["Commercialization Pathway", "From pilot to commercial deployment", ["Pilot validation and metrics review", "Contract negotiation and procurement", "Integration and technical onboarding", "Revenue validation and scaling"]] };
    case "timeline": return { builder: buildTimeline, args: ["Program Timeline", ["Months 1-2\nDesign", "Months 3-4\nScouting", "Months 5-8\nPilots", "Months 9-12\nScale"]] };
    case "case_study": return { builder: buildSectionHeader, args: ["Relevant Experience", "Proven track record across MENA", ["Dubai DET / Hi2 — 40+ startups, $12M+", "EDB Manufacturing — 15 startups, 5 pilots", "MBRIF — 25 startups, 8 commercialized", "QSTP — Tech transfer program"]] };
    case "why_brinc": return { builder: buildMetrics, args: ["Why Brinc", [{value:"12+",label:"Years"},{value:"75+",label:"Programs"},{value:"170+",label:"Portfolio"},{value:"$1.69B+",label:"Valuation"},{value:"20+",label:"Countries"},{value:"Tech",label:"VentureVerse"}]] };
    case "next_steps": return { builder: buildSectionHeader, args: ["Next Steps", null, ["1. Finalize scope and commercial terms", "2. Sign agreement and mobilize teams", "3. Launch program design (Weeks 1-4)", "4. Execute pilot phase (Months 2-6)", "5. Scale and transition (Months 7-12)"]] };
    case "ecosystem": return { builder: buildSectionHeader, args: ["The Ecosystem", "Brinc's global innovation network", ["Global: 20+ countries across MENA, Asia, Europe, Americas", "Deep UAE/GCC presence", "Cross-sector: AI, climate, health, fintech, space", "Strong investor network"]] };
    case "reporting": return { builder: buildTwoColumn, args: ["Reporting & KPIs", "Tracking Metrics", ["Applications received", "Selection rate (%)", "Startups funded", "Pilots launched"], "Reporting Cadence", ["Weekly: Team standup", "Monthly: Executive dashboard", "Quarterly: Business review", "Annual: Impact report"]] };
    case "team": return { builder: buildSectionHeader, args: ["Program Team", "Dedicated Brinc team", ["Program Director: Strategy & governance", "Scouting Lead: Sourcing & selection", "Mentorship Lead: Founder coaching", "Pilot Manager: Execution & handover"]] };
    case "market_opportunity": return { builder: buildSectionHeader, args: ["Market Opportunity", "Strong dynamics in " + (geo || "the region"), ["Growing startup ecosystem with investor interest", "Government innovation policies and funding", "Corporate demand for external innovation", "Growing pool of technical founders"]] };
    case "why_now": return { builder: buildSectionHeader, args: ["Why Now", null, ["1. Innovation funding at record levels in " + (geo || "the region"), "2. Growing startup talent pool", "3. Strong government support", "4. First-mover advantage in " + (offerings[0] || "this space")]] };
    case "strategic_context": return { builder: buildSectionHeader, args: ["Strategic Context", "Alignment with national priorities", ["Aligned with innovation and diversification strategies", "Contributes to in-country value creation", "Supports entrepreneurship and job creation", "Positions " + co + " as innovation leader"]] };
    case "opportunity": return { builder: buildSectionHeader, args: ["The Opportunity", "A significant market opportunity", [co + " is positioned to capture significant value", "Early movers seeing 3-5x returns", "Brinc's methodology de-risks execution"]] };
    case "venture_building": return { builder: buildSectionHeader, args: ["Venture Building Model", "From idea to launch through co-creation", ["Phase 1: Ideation and validation", "Phase 2: Co-creation with " + co, "Phase 3: MVP build and testing", "Phase 4: Launch and growth support"]] };
    case "curriculum": return { builder: buildSectionHeader, args: ["Program Curriculum", "Structured learning for " + co, ["Module 1: Strategy & Opportunity Mapping", "Module 2: Technology Deep Dive", "Module 3: Implementation Playbook", "Module 4: Change Management", "Module 5: Capstone Project"]] };
    default: return { builder: buildSectionHeader, args: [type.replace(/_/g, " "), null, ["[Content for " + type + "]"]] };
  }
}

// ── Main Handler ──────────────────────────────────────────

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.end(JSON.stringify({ ok: true, hasDriveFolder: !!DRIVE_ROOT }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  var body = req.body || {};
  var accessToken = body.accessToken;
  var refreshToken = body.refreshToken || "";

  if (!accessToken) return res.end(JSON.stringify({ ok: false, error: "Missing accessToken" }));

  var prospectCompany = body.prospectCompany || body.prospectName || "Partner";
  var offerings = body.offerings || [];
  var suggestedAngle = body.suggestedAngle || "";
  var archetypeKey = body.archetype || "accelerator";
  var geo = body.geography || "";

  var logs = [];
  var title = prospectCompany + " x Brinc";
  var arch = ARCHETYPES[archetypeKey] || ARCHETYPES.accelerator;

  logs.push("Archetype: " + archetypeKey + " (" + arch.label + ")");

  // Token refresh
  var tokenPromise = Promise.resolve();
  if (refreshToken) {
    tokenPromise = gapi(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken).then(function(check) {
      if (!check.ok) {
        return fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "", grant_type: "refresh_token" }),
        }).then(function(r) { return r.json(); }).then(function(d) { if (d.access_token) accessToken = d.access_token; });
      }
    });
  }

  // Load both indexes in parallel
  var indexPromise = tokenPromise.then(function() {
    return loadIndexFromDrive(accessToken, logs);
  });
  var dnaPromise = tokenPromise.then(function() {
    return loadDNAIndexFromDrive(accessToken, logs);
  });

  Promise.all([indexPromise, dnaPromise]).then(function(results) {
    var slideIndex = results[0];
    var dnaIndex = results[1];

    // Build assembly plan with DNA + visual similarity
    var plan;
    if (slideIndex && slideIndex.slides && slideIndex.slides.length > 0) {
      plan = buildAssemblyPlan(slideIndex, dnaIndex, archetypeKey, offerings, geo);
      var cloned = plan.filter(function(s) { return s.source === "cloned"; }).length;
      var retrieved = plan.filter(function(s) { return s.source === "retrieved"; }).length;
      var inspired = plan.filter(function(s) { return s.source === "inspired"; }).length;
      var generated = plan.filter(function(s) { return s.source === "generated"; }).length;
      logs.push("Plan: " + cloned + " cloned, " + retrieved + " retrieved, " + inspired + " inspired, " + generated + " generated");
    } else {
      logs.push("No index — generating synthetically");
      plan = arch.sectionOrder.map(function(st) { return { type: st, label: st.replace(/_/g, " "), source: "generated", score: 0, candidate: null, dna: null }; });
    }

    // Apply deck coherence — rhythm, pacing, adjacent-slide consistency
    plan = applyCoherence(plan, archetypeKey);
    var coherenceBoosts = plan.filter(function(s) { return s.preserveStyle; }).length;
    if (coherenceBoosts > 0) logs.push("Coherence: " + coherenceBoosts + " slides marked for style preservation");

    // Lineage tracking
    var lineageRecords = [];
    var inputs = { archetype: archetypeKey, prospectCompany: prospectCompany, offerings: offerings, geography: geo };

    // Create presentation
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations", {
      method: "POST",
      body: JSON.stringify({ title: title }),
    }).then(function(created) {
      if (!created.ok) throw new Error(created.data.error ? created.data.error.message : "Create failed");
      var presId = created.data.presentationId;
      logs.push("Created: " + presId);

      // Build all sections
      var now = Date.now();
      var slideIdx = 0;
      var allReqs = [];
      var sectionMap = [];

      plan.forEach(function(sec) {
        if (!sec || !sec.type) return;
        var sid = "s" + now + "_" + slideIdx;
        slideIdx++;

        var result;

        if (sec.source === "cloned" && sec.dna && sec.dna.sourcePresentationId) {
          // ── TEMPLATE CLONING: physically copy the historical slide ──
          var cloneReq = buildCloneSlideRequest(sid, sec.dna.sourcePresentationId, sec.dna.slideId);
          allReqs.push(cloneReq);
          sectionMap.push({ type: sec.type, label: sec.label, source: "cloned", score: sec.score, textScore: sec.textScore || 0, visualScore: sec.visualScore || 0, slideIndex: slideIdx, preserveStyle: sec.preserveStyle || false });
          lineageRecords.push(createLineageRecord(sec, presId, inputs));
          logs.push("  [C] " + sec.type + " (score: " + sec.score + ", visual: " + (sec.visualScore || 0) + ") from " + sec.dna.sourceDeck);
          return;

        } else if (sec.source === "retrieved" && sec.candidate) {
          var adaptedText = adaptRetrievedContent(sec.candidate.text, prospectCompany, offerings, geo);
          var adaptedLines = adaptedText.split(/\n|\|/).filter(function(l) { return l.trim().length > 5; }).slice(0, 6);
          if (adaptedLines.length === 0) adaptedLines = [adaptedText.substring(0, 300)];
          result = { builder: buildSectionHeader, args: [sec.label, "Adapted from " + (sec.candidate.sourceDeck || "historical deck"), adaptedLines] };
          logs.push("  [R] " + sec.type + " (score: " + sec.score + ")");
        } else if (sec.source === "inspired" && sec.candidate) {
          var inspiredText = adaptRetrievedContent(sec.candidate.text, prospectCompany, offerings, geo);
          var inspiredLines = inspiredText.split(/\n|\|/).filter(function(l) { return l.trim().length > 5; }).slice(0, 6);
          if (inspiredLines.length > 0) {
            result = { builder: buildSectionHeader, args: [sec.label, "Based on " + (sec.candidate.sourceDeck || "historical deck"), inspiredLines] };
          } else {
            result = generateSyntheticContent(sec.type, prospectCompany, offerings, suggestedAngle, geo);
          }
          logs.push("  [I] " + sec.type + " (score: " + sec.score + ")");
        } else {
          result = generateSyntheticContent(sec.type, prospectCompany, offerings, suggestedAngle, geo);
          logs.push("  [G] " + sec.type);
        }

        if (result && result.builder) {
          var builderArgs = [sid].concat(result.args || []);
          var reqs = result.builder.apply(null, builderArgs);
          allReqs = allReqs.concat(reqs);
          sectionMap.push({ type: sec.type, label: sec.label, source: sec.source, score: sec.score, textScore: sec.textScore || 0, visualScore: sec.visualScore || 0, slideIndex: slideIdx, preserveStyle: sec.preserveStyle || false });
          lineageRecords.push(createLineageRecord(sec, presId, inputs));
        }
      });

      logs.push("Total requests: " + allReqs.length);
      logs.push("Lineage: " + lineageRecords.length + " records tracked");

      // Apply batchUpdate
      return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests: allReqs }),
      }).then(function(batch) {
        if (!batch.ok) {
          fetch("https://www.googleapis.com/drive/v3/files/" + presId, { method: "DELETE", headers: { Authorization: "Bearer " + accessToken } }).catch(function(){});
          throw new Error(batch.data.error ? batch.data.error.message : "Batch failed");
        }
        logs.push("Batch applied: " + allReqs.length + " requests");

        // Save lineage (fire and forget — don't block response)
        if (lineageRecords.length > 0) {
          saveLineage(accessToken, lineageRecords, logs).catch(function(){});
        }

        // Folder move
        var folderPath = "";
        if (!DRIVE_ROOT) {
          return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: "", logs: logs, archetype: archetypeKey, archetypeLabel: arch.label, sectionMap: sectionMap };
        }
        return gapi(accessToken, "https://www.googleapis.com/drive/v3/files/" + presId + "?fields=parents&supportsAllDrives=true")
          .then(function(before) {
            var currentParents = before.data.parents || ["root"];
            var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='01 Generated Proposals' and trashed=false");
            return gapi(accessToken, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
              .then(function(search) {
                var found = search.data.files || [];
                if (found[0]) { logs.push("Reuse folder: " + found[0].id); return found[0].id; }
                return gapi(accessToken, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
                  method: "POST",
                  body: JSON.stringify({ name: "01 Generated Proposals", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
                }).then(function(c) { logs.push("Created folder: " + c.data.id); return c.data.id; });
              })
              .then(function(folderId) {
                if (!folderId) return "";
                return gapi(accessToken, "https://www.googleapis.com/drive/v3/files/" + presId + "?addParents=" + folderId + "&removeParents=" + currentParents.join(",") + "&supportsAllDrives=true&fields=id,parents", { method: "PATCH" })
                  .then(function(moved) {
                    logs.push("Move: HTTP " + moved.status);
                    if (moved.ok && (moved.data.parents || []).indexOf(folderId) >= 0) folderPath = "01 Generated Proposals";
                    return folderPath;
                  });
              });
          })
          .then(function(fp) {
            return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: fp, logs: logs, archetype: archetypeKey, archetypeLabel: arch.label, sectionMap: sectionMap, lineageTracked: lineageRecords.length };
          });
      });
    });
  }).then(function(result) {
    res.end(JSON.stringify(result));
  }).catch(function(err) {
    console.error("[Slides]", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message, logs: logs }));
  });
}
