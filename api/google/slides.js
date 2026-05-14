const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// ═══════════════════════════════════════════════════════════
//  BRINC RETRIEVAL-FIRST SLIDES ASSEMBLER
//  1. Load slide index from Drive
//  2. Build assembly plan (retrieve → adapt → generate)
//  3. Assemble final presentation
// ═══════════════════════════════════════════════════════════

import {
  buildAssemblyPlan,
  adaptRetrievedContent,
  loadIndexFromDrive,
} from "./retrieval.js";

// ── Archetype Definitions (inline for reliability) ───────

var ARCHETYPES = {
  accelerator: {
    label: "Accelerator Program",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_framing","objectives","ecosystem","approach","scouting","startup_support","pilot_execution","commercialization","timeline","case_study","why_brinc","next_steps"],
    tone: "confident_execution"
  },
  incubator: {
    label: "Incubator / Venture Building",
    sectionOrder: ["cover","title_sentence","executive_summary","opportunity","approach","venture_building","scouting","pilot_execution","commercialization","timeline","case_study","team","next_steps"],
    tone: "innovation_partner"
  },
  soft_landing: {
    label: "Soft Landing / Market Entry",
    sectionOrder: ["cover","title_sentence","executive_summary","market_opportunity","ecosystem","approach","scouting","startup_support","commercialization","timeline","case_study","why_brinc","next_steps"],
    tone: "market_expert"
  },
  sandbox: {
    label: "Sandbox / Regulator Program",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_framing","regulatory_context","approach","scouting","pilot_execution","reporting","timeline","case_study","team","next_steps"],
    tone: "authority_confidence"
  },
  innovation_challenge: {
    label: "Innovation Challenge",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_statement","approach","scouting","selection","startup_support","pilot_execution","awards","timeline","case_study","next_steps"],
    tone: "energy_urgency"
  },
  corporate_innovation: {
    label: "Corporate Innovation",
    sectionOrder: ["cover","title_sentence","executive_summary","challenge_framing","objectives","approach","scouting","startup_support","pilot_execution","commercialization","reporting","case_study","why_brinc","next_steps"],
    tone: "executive_partner"
  },
  ai_training: {
    label: "AI / Corporate Training",
    sectionOrder: ["cover","title_sentence","executive_summary","why_now","ecosystem","approach","curriculum","timeline","case_study","team","next_steps"],
    tone: "thought_leader"
  },
  government_capability: {
    label: "Government Capability Building",
    sectionOrder: ["cover","title_sentence","executive_summary","strategic_context","objectives","approach","ecosystem","scouting","startup_support","reporting","case_study","why_brinc","next_steps"],
    tone: "government_partner"
  },
  executive_workshop: {
    label: "Executive Workshop",
    sectionOrder: ["cover","title_sentence","objectives","agenda","approach","case_study","next_steps"],
    tone: "executive_partner"
  },
  venture_building: {
    label: "Venture Building",
    sectionOrder: ["cover","title_sentence","executive_summary","opportunity","approach","venture_building","scouting","pilot_execution","commercialization","timeline","case_study","team","next_steps"],
    tone: "innovation_partner"
  }
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
  green:         { red: 0.180, green: 0.620, blue: 0.380 },
  orange:        { red: 0.920, green: 0.520, blue: 0.180 },
};

function navyText(size) { return { bold: true, fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.navy } } }; }
function whiteText(size) { return { bold: true, fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.white } } }; }
function grayText(size) { return { fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.gray } } }; }
function lightGrayText(size) { return { fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.lightGray } } }; }

// ── Helpers ───────────────────────────────────────────────

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
  } });
  if (text) reqs.push({ insertText: { objectId: id, text: text } });
  if (style) reqs.push({ updateTextStyle: { objectId: id, style: style, fields: fields || "bold,fontSize,foregroundColor" } });
  return reqs;
}

function rectangle(id, pageId, x, y, w, h, color) {
  var reqs = [];
  reqs.push({ createShape: {
    objectId: id, shapeType: "RECTANGLE",
    elementProperties: { pageObjectId: pageId, size: { width: { magnitude: w, unit: "PT" }, height: { magnitude: h, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "PT" } } }
  } });
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

// ── Section Builders ──────────────────────────────────────

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

function buildTitleSentence(sid, title) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(rectangle("tsbg" + sid, sid, 0, 0, 720, 540, COLORS.veryLightGray));
  r = r.concat(rectangle("tsbar" + sid, sid, 0, 0, 720, 6, COLORS.navy));
  r = r.concat(textBox("tst" + sid, sid, 60, 140, 600, 200, title || "Building a transformative innovation program.", navyText(36), "bold,fontSize,foregroundColor"));
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
  var cols = 3;
  var colW = 200;
  var startX = 40;
  var startY = 130;
  metrics.forEach(function(m, i) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    var x = startX + col * (colW + 20);
    var y = startY + row * 140;
    r = r.concat(textBox("mn" + sid + "_" + i, sid, x, y, colW, 50, m.value || "\u2014", { bold: true, fontSize: { magnitude: 36, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.navy } } }, "bold,fontSize,foregroundColor"));
    r = r.concat(textBox("ml" + sid + "_" + i, sid, x, y + 50, colW, 40, m.label || "", grayText(12), "fontSize,foregroundColor"));
  });
  return r;
}

// ── Content Generator (synthetic fallback) ─────────────────

function generateSyntheticContent(type, co, offerings, angle, geo) {
  switch (type) {
    case "cover": return { builder: buildCover, args: [co, angle] };
    case "title_sentence": {
      var p = [
        "Building a " + (offerings[0] || "transformative program") + " with " + co + " to accelerate innovation",
        "Partnering with " + co + " to launch a " + (geo || "regional") + " innovation program",
        "Co-creating an innovation ecosystem with " + co + " through " + (offerings[0] || "structured programs")
      ];
      return { builder: buildTitleSentence, args: [p[Math.floor(Math.random() * p.length)]] };
    }
    case "executive_summary": return { builder: buildSectionHeader, args: [
      "Executive Summary",
      "A partnership between " + co + " and Brinc",
      ["Program: " + (offerings[0] || "Innovation program"), "Approach: " + offerings.join(", "), "Outcome: Measurable innovation outcomes"]
    ]};
    case "challenge_framing": return { builder: buildSectionHeader, args: [
      "The Opportunity",
      co + " has a strategic opportunity to accelerate innovation",
      ["Market signals indicate strong demand for " + (offerings[0] || "innovation"), "Structured programs deliver 3-5x faster commercialization", "Brinc: 75+ programs, 170+ portfolio companies, $1.69B+ valuation"]
    ]};
    case "objectives": return { builder: buildSectionHeader, args: [
      "Program Objectives", null,
      ["1. Launch " + (offerings[0] || "structured program"), "2. Source top-tier startups for " + co, "3. Execute pilots with measurable outcomes", "4. Build sustainable innovation capabilities"]
    ]};
    case "approach": return { builder: buildTwoColumn, args: [
      "Our Approach", "Discovery & Design",
      ["Diagnostic assessment", "Program co-design", "Stakeholder alignment", "Success criteria"],
      "Execution & Scale",
      ["Startup scouting", "Pilot sprint execution", "Commercialization support", "Knowledge transfer"]
    ]};
    case "scouting": return { builder: buildSectionHeader, args: [
      "Startup Scouting & Selection",
      "A rigorous, data-driven process",
      ["Global sourcing through 20+ countries", "Multi-channel: events, referrals, partnerships", "Data-driven via VentureVerse", "Target: Top 1-3% of applicants"]
    ]};
    case "startup_support": return { builder: buildTwoColumn, args: [
      "Startup Support Services", "Program Support",
      ["1:1 mentorship", "Fundraising & investor intros", "Commercial pilot design", "Product guidance"],
      "Platform & Tools",
      ["VentureVerse analytics", "Progress tracking", "Portfolio management", "Reporting & KPIs"]
    ]};
    case "pilot_execution": return { builder: buildSectionHeader, args: [
      "Pilot Execution Framework",
      "Structured sprints with clear success criteria",
      ["12-16 week pilot sprints with milestones", "Success criteria with measurable KPIs", "Regular reviews and stakeholder sessions", "Go/no-go framework at each gate"]
    ]};
    case "commercialization": return { builder: buildSectionHeader, args: [
      "Commercialization Pathway",
      "From pilot to commercial deployment",
      ["Pilot validation and metrics review", "Contract negotiation and procurement", "Integration and technical onboarding", "Revenue validation and scaling"]
    ]};
    case "timeline": return { builder: buildTimeline, args: [
      "Program Timeline",
      ["Months 1-2\nDesign", "Months 3-4\nScouting", "Months 5-8\nPilots", "Months 9-12\nScale"]
    ]};
    case "case_study": return { builder: buildSectionHeader, args: [
      "Relevant Experience",
      "Proven track record across MENA",
      ["Dubai DET / Hi2 — 40+ startups, $12M+", "EDB Manufacturing — 15 startups, 5 pilots", "MBRIF — 25 startups, 8 commercialized", "QSTP — Tech transfer program"]
    ]};
    case "why_brinc": return { builder: buildMetrics, args: [
      "Why Brinc",
      [{value:"12+",label:"Years"},{value:"75+",label:"Programs"},{value:"170+",label:"Portfolio"},{value:"$1.69B+",label:"Valuation"},{value:"20+",label:"Countries"},{value:"Tech",label:"VentureVerse"}]
    ]};
    case "next_steps": return { builder: buildSectionHeader, args: [
      "Next Steps", null,
      ["1. Finalize scope and commercial terms", "2. Sign agreement and mobilize teams", "3. Launch program design (Weeks 1-4)", "4. Execute pilot phase (Months 2-6)", "5. Scale and transition (Months 7-12)"]
    ]};
    case "ecosystem": return { builder: buildSectionHeader, args: [
      "The Ecosystem",
      "Brinc's global innovation network",
      ["Global: 20+ countries across MENA, Asia, Europe, Americas", "Deep UAE/GCC presence", "Cross-sector: AI, climate, health, fintech, space", "Strong investor network"]
    ]};
    case "reporting": return { builder: buildTwoColumn, args: [
      "Reporting & KPIs", "Tracking Metrics",
      ["Applications received", "Selection rate (%)", "Startups funded", "Pilots launched"],
      "Reporting Cadence",
      ["Weekly: Team standup", "Monthly: Executive dashboard", "Quarterly: Business review", "Annual: Impact report"]
    ]};
    case "team": return { builder: buildSectionHeader, args: [
      "Program Team",
      "Dedicated Brinc team",
      ["Program Director: Strategy & governance", "Scouting Lead: Sourcing & selection", "Mentorship Lead: Founder coaching", "Pilot Manager: Execution & handover"]
    ]};
    case "market_opportunity": return { builder: buildSectionHeader, args: [
      "Market Opportunity",
      "Strong dynamics in " + (geo || "the region"),
      ["Growing startup ecosystem with investor interest", "Government innovation policies and funding", "Corporate demand for external innovation", "Growing pool of technical founders"]
    ]};
    case "why_now": return { builder: buildSectionHeader, args: [
      "Why Now", null,
      ["1. Innovation funding at record levels in " + (geo || "the region"), "2. Growing startup talent pool", "3. Strong government support", "4. First-mover advantage in " + (offerings[0] || "this space")]
    ]};
    case "strategic_context": return { builder: buildSectionHeader, args: [
      "Strategic Context",
      "Alignment with national priorities",
      ["Aligned with innovation and diversification strategies", "Contributes to in-country value creation", "Supports entrepreneurship and job creation", "Positions " + co + " as innovation leader"]
    ]};
    case "opportunity": return { builder: buildSectionHeader, args: [
      "The Opportunity",
      "A significant market opportunity",
      [co + " is positioned to capture significant value", "Early movers seeing 3-5x returns", "Brinc's methodology de-risks execution"]
    ]};
    case "venture_building": return { builder: buildSectionHeader, args: [
      "Venture Building Model",
      "From idea to launch through co-creation",
      ["Phase 1: Ideation and validation", "Phase 2: Co-creation with " + co, "Phase 3: MVP build and testing", "Phase 4: Launch and growth support"]
    ]};
    case "curriculum": return { builder: buildSectionHeader, args: [
      "Program Curriculum",
      "Structured learning for " + co,
      ["Module 1: Strategy & Opportunity Mapping", "Module 2: Technology Deep Dive", "Module 3: Implementation Playbook", "Module 4: Change Management", "Module 5: Capstone Project"]
    ]};
    default:
      return { builder: buildSectionHeader, args: [type, null, ["[Content for " + type + "]"]] };
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

  // ── STEP 1: Load slide index from Drive ──
  var slideIndexPromise = loadIndexFromDrive(accessToken, logs);

  // ── STEP 2: Token refresh + create presentation ──
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

  Promise.all([tokenPromise, slideIndexPromise]).then(function(results) {
    var slideIndex = results[1];

    // ── STEP 3: Build assembly plan ──
    var plan;
    if (slideIndex && slideIndex.slides && slideIndex.slides.length > 0) {
      logs.push("Slide index loaded: " + slideIndex.slides.length + " slides");
      plan = buildAssemblyPlan(slideIndex, archetypeKey, offerings, geo, prospectCompany);
      var retrieved = plan.filter(function(s) { return s.source === "retrieved"; }).length;
      var inspired = plan.filter(function(s) { return s.source === "inspired"; }).length;
      var generated = plan.filter(function(s) { return s.source === "generated"; }).length;
      logs.push("Assembly plan: " + retrieved + " retrieved, " + inspired + " inspired, " + generated + " generated");
    } else {
      // No index — all generated
      logs.push("No slide index — generating synthetically");
      plan = arch.sectionOrder.map(function(st) {
        return { type: st, label: st, source: "generated", score: 0, candidate: null };
      });
    }

    // ── STEP 4: Create presentation ──
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations", {
      method: "POST",
      body: JSON.stringify({ title: title }),
    }).then(function(created) {
      if (!created.ok) throw new Error(created.data.error ? created.data.error.message : "Create failed");
      var presId = created.data.presentationId;
      logs.push("Created: " + presId);

      // ── STEP 5: Build sections from plan ──
      var now = Date.now();
      var slideIdx = 0;
      var allReqs = [];
      var sectionMap = [];

      plan.forEach(function(sec) {
        if (!sec || !sec.type) return;

        var sid = "s" + now + "_" + slideIdx;
        slideIdx++;

        var result;

        if (sec.source === "retrieved" && sec.candidate) {
          // ── RETRIEVED: adapt historical content ──
          var adaptedText = adaptRetrievedContent(sec.candidate.text, prospectCompany, offerings, geo);
          // Parse adapted text into bullets or use as-is
          var adaptedLines = adaptedText.split(/\n|\|/).filter(function(l) { return l.trim().length > 5; }).slice(0, 6);
          if (adaptedLines.length === 0) adaptedLines = [adaptedText.substring(0, 300)];

          result = { builder: buildSectionHeader, args: [sec.label || sec.type, "Adapted from " + (sec.candidate.sourceDeck || "historical deck"), adaptedLines] };
          logs.push("  [R] " + sec.type + " (score: " + sec.score + ") from " + (sec.candidate.sourceDeck || "?"));

        } else if (sec.source === "inspired" && sec.candidate) {
          // ── INSPIRED: blend historical content with generation ──
          var inspiredText = adaptRetrievedContent(sec.candidate.text, prospectCompany, offerings, geo);
          var inspiredLines = inspiredText.split(/\n|\|/).filter(function(l) { return l.trim().length > 5; }).slice(0, 6);
          if (inspiredLines.length > 0) {
            result = { builder: buildSectionHeader, args: [sec.label || sec.type, "Based on " + (sec.candidate.sourceDeck || "historical deck"), inspiredLines] };
          } else {
            result = generateSyntheticContent(sec.type, prospectCompany, offerings, suggestedAngle, geo);
          }
          logs.push("  [I] " + sec.type + " (score: " + sec.score + ")");

        } else {
          // ── GENERATED: build synthetically ──
          result = generateSyntheticContent(sec.type, prospectCompany, offerings, suggestedAngle, geo);
          logs.push("  [G] " + sec.type);
        }

        if (result && result.builder) {
          var builderArgs = [sid].concat(result.args || []);
          var reqs = result.builder.apply(null, builderArgs);
          allReqs = allReqs.concat(reqs);

          sectionMap.push({
            type: sec.type,
            label: sec.label || sec.type,
            source: sec.source,
            score: sec.score,
            slideIndex: slideIdx
          });
        }
      });

      logs.push("Total API requests: " + allReqs.length);

      // ── STEP 6: Apply batchUpdate ──
      return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests: allReqs }),
      }).then(function(batch) {
        if (!batch.ok) {
          fetch("https://www.googleapis.com/drive/v3/files/" + presId, {
            method: "DELETE", headers: { Authorization: "Bearer " + accessToken }
          }).catch(function(){});
          throw new Error(batch.data.error ? batch.data.error.message : "Batch failed");
        }
        logs.push("Batch applied: " + allReqs.length + " requests");

        // ── STEP 7: Folder move ──
        var folderPath = "";
        if (DRIVE_ROOT) {
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
              return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: fp, logs: logs, archetype: archetypeKey, archetypeLabel: arch.label, sectionMap: sectionMap };
            });
        }
        return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: "", logs: logs, archetype: archetypeKey, archetypeLabel: arch.label, sectionMap: sectionMap };
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
