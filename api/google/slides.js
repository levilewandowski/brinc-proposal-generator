const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// ═══════════════════════════════════════════════════════════
//  BRINC INTELLIGENT SLIDES GENERATOR
//  Retrieval-augmented, archetype-aware proposal generation
// ═══════════════════════════════════════════════════════════

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

  // Decorative accent rectangle (top right)
  r = r.concat(rectangle("deca" + sid, sid, 540, 0, 180, 180, COLORS.navyLight));

  // Partner name
  r = r.concat(textBox("t" + sid, sid, 50, 170, 600, 70, co || "Partner", whiteText(42), "bold,fontSize,foregroundColor"));
  // "x Brinc"
  r = r.concat(textBox("st" + sid, sid, 50, 250, 400, 40, "x Brinc", lightGrayText(22), "fontSize,foregroundColor"));
  // Accent bar
  r = r.concat(rectangle("cab" + sid, sid, 50, 300, 100, 3, COLORS.accent));
  // Context line
  if (angle) {
    var ctx = angle.split("\n").filter(Boolean).slice(0, 2).join("\n");
    r = r.concat(textBox("ctx" + sid, sid, 50, 320, 600, 60, ctx, lightGrayText(12), "fontSize,foregroundColor"));
  }
  // Date
  var dateStr = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  r = r.concat(textBox("dt" + sid, sid, 50, 480, 300, 20, dateStr, lightGrayText(10), "fontSize,foregroundColor"));
  return r;
}

function buildTitleSentence(sid, title) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  // Subtle background accent
  r = r.concat(rectangle("tsbg" + sid, sid, 0, 0, 720, 540, COLORS.veryLightGray));
  // Navy accent bar top
  r = r.concat(rectangle("tsbar" + sid, sid, 0, 0, 720, 6, COLORS.navy));
  // Title sentence
  r = r.concat(textBox("tst" + sid, sid, 60, 140, 600, 200, title || "Building a transformative innovation program.", navyText(36), "bold,fontSize,foregroundColor"));
  // Brinc attribution
  r = r.concat(textBox("tsa" + sid, sid, 60, 360, 300, 30, "— Brinc", grayText(16), "fontSize,foregroundColor"));
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

  // Left column
  r = r.concat(textBox("lt" + sid, sid, 40, 105, 320, 30, leftTitle, { bold: true, fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.accent } } }, "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("lb" + sid, sid, 40, 140, 320, 350, leftItems.join("\n"), grayText(12), "fontSize,foregroundColor"));

  // Divider
  r = r.concat(rectangle("div" + sid, sid, 370, 105, 1, 350, COLORS.lightGray));

  // Right column
  r = r.concat(textBox("rt" + sid, sid, 390, 105, 300, 30, rightTitle, { bold: true, fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.accent } } }, "bold,fontSize,foregroundColor"));
  r = r.concat(textBox("rb" + sid, sid, 390, 140, 300, 350, rightItems.join("\n"), grayText(12), "fontSize,foregroundColor"));

  return r;
}

function buildTimeline(sid, title, phases) {
  var r = [];
  r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
  r = r.concat(accentBar(sid, 40, 42));
  r = r.concat(textBox("ht" + sid, sid, 40, 48, 620, 50, title, navyText(28), "bold,fontSize,foregroundColor"));

  // Timeline bar
  r = r.concat(rectangle("tlbar" + sid, sid, 40, 140, 640, 3, COLORS.accent));

  // Phase nodes
  var startX = 50;
  var step = phases.length > 1 ? 580 / (phases.length - 1) : 580;
  phases.forEach(function(phase, i) {
    var x = startX + step * i;
    // Dot
    r = r.concat(rectangle("tld" + sid + "_" + i, sid, x, 134, 15, 15, COLORS.navy));
    // Phase label
    r = r.concat(textBox("tll" + sid + "_" + i, sid, x - 30, 160, 120, 60, phase, grayText(10), "fontSize,foregroundColor"));
  });

  return r;
}

function buildNumberedList(sid, title, items) {
  return buildSectionHeader(sid, title, null, items);
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

    // Metric number (large)
    r = r.concat(textBox("mn" + sid + "_" + i, sid, x, y, colW, 50, m.value || "—", { bold: true, fontSize: { magnitude: 36, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.navy } } }, "bold,fontSize,foregroundColor"));
    // Metric label
    r = r.concat(textBox("ml" + sid + "_" + i, sid, x, y + 50, colW, 40, m.label || "", grayText(12), "fontSize,foregroundColor"));
  });

  return r;
}

// ── Content Generator ─────────────────────────────────────

function generateContent(arch, co, offerings, angle, geo) {
  var sections = [];
  var order = arch.sectionOrder;

  order.forEach(function(type) {
    switch (type) {
      case "cover":
        sections.push({ type: "cover", builder: buildCover, args: [co, angle] });
        break;

      case "title_sentence":
        var patterns = [
          "Building a " + (offerings[0] || "transformative program") + " with " + co + " to accelerate innovation",
          "Partnering with " + co + " to launch a " + arch.label.toLowerCase() + " in " + (geo || "the region"),
          "Co-creating an innovation ecosystem with " + co + " through " + (offerings[0] || "structured programs"),
          "Enabling " + co + " to drive " + (offerings[0] || "innovation") + " via Brinc's proven methodology"
        ];
        sections.push({ type: "title_sentence", builder: buildTitleSentence, args: [patterns[Math.floor(Math.random() * patterns.length)]] });
        break;

      case "executive_summary":
        sections.push({ type: "executive_summary", builder: buildSectionHeader, args: [
          "Executive Summary",
          "A " + arch.label + " partnership between " + co + " and Brinc",
          [
            "Program: " + (offerings[0] || "Innovation program"),
            "Duration: " + arch.tone + " methodology over typical program cycle",
            "Approach: Leverage Brinc's " + (offerings.join(", ") || "proven methodology"),
            "Outcome: Measurable innovation outcomes and ecosystem development"
          ]
        ]});
        break;

      case "challenge_framing":
        sections.push({ type: "challenge_framing", builder: buildSectionHeader, args: [
          "The Opportunity",
          co + " has a strategic opportunity to accelerate innovation",
          [
            "Market signals indicate strong demand for " + (offerings[0] || "innovation capabilities") + " in " + (geo || "the region"),
            "Structured programs deliver 3-5x faster startup commercialization",
            "Brinc's track record: 75+ programs, 170+ portfolio companies, $1.69B+ valuation"
          ]
        ]});
        break;

      case "objectives":
        sections.push({ type: "objectives", builder: buildNumberedList, args: [
          "Program Objectives",
          [
            "1. Launch a " + (offerings[0] || "structured program") + " within the agreed timeframe",
            "2. Source and select top-tier startups aligned with " + co + "'s strategic priorities",
            "3. Execute pilots demonstrating measurable commercial outcomes",
            "4. Build sustainable innovation capabilities within " + co
          ]
        ]});
        break;

      case "approach":
        sections.push({ type: "approach", builder: buildTwoColumn, args: [
          "Our Approach",
          "Discovery & Design",
          ["Diagnostic assessment", "Program co-design", "Stakeholder alignment", "Success criteria definition"],
          "Execution & Scale",
          ["Startup scouting & selection", "Pilot sprint execution", "Commercialization support", "Knowledge transfer & handover"]
        ]});
        break;

      case "scouting":
        sections.push({ type: "scouting", builder: buildSectionHeader, args: [
          "Startup Scouting & Selection",
          "A rigorous, data-driven process to identify the best startups",
          [
            "Global sourcing through Brinc's network of 20+ countries",
            "Multi-channel outreach: events, referrals, partnerships, direct applications",
            "Data-driven assessment using VentureVerse platform tools",
            "Rigorous screening: application review, interviews, due diligence",
            "Target: Top 1-3% of applicants based on strategic fit and growth potential"
          ]
        ]});
        break;

      case "startup_support":
        sections.push({ type: "startup_support", builder: buildTwoColumn, args: [
          "Startup Support Services",
          "Program Support",
          ["1:1 mentorship with domain experts", "Fundraising strategy & investor intros", "Commercial pilot design", "Product & technology guidance"],
          "Platform & Tools",
          ["VentureVerse analytics platform", "Progress tracking dashboards", "Portfolio management tools", "Reporting & KPI monitoring"]
        ]});
        break;

      case "pilot_execution":
        sections.push({ type: "pilot_execution", builder: buildSectionHeader, args: [
          "Pilot Execution Framework",
          "Structured pilot sprints with clear success criteria",
          [
            "12-16 week pilot sprints with defined milestones and gates",
            "Success criteria established upfront with measurable KPIs",
            "Regular progress reviews and stakeholder alignment sessions",
            "Go/no-go decision framework at each milestone",
            "Commercial handover plan for successful pilots"
          ]
        ]});
        break;

      case "commercialization":
        sections.push({ type: "commercialization", builder: buildSectionHeader, args: [
          "Commercialization Pathway",
          "From pilot to commercial deployment",
          [
            "Pilot validation and success metrics review",
            "Contract negotiation and procurement pathway",
            "Integration support and technical onboarding",
            "Revenue model validation and scaling plan",
            "Long-term partnership and expansion roadmap"
          ]
        ]});
        break;

      case "timeline":
        sections.push({ type: "timeline", builder: buildTimeline, args: [
          "Program Timeline",
          ["Months 1-2\nDesign & Setup", "Months 3-4\nScouting & Selection", "Months 5-8\nPilot Execution", "Months 9-12\nScale & Handover"]
        ]});
        break;

      case "case_study":
        sections.push({ type: "case_study", builder: buildSectionHeader, args: [
          "Relevant Experience",
          "Proven track record across MENA and beyond",
          [
            "Dubai DET / Hi2 Incubator — 40+ startups, $12M+ raised, 8 pilots launched",
            "EDB Manufacturing Accelerator — 15 startups, 5 commercial pilots executed",
            "MBRIF Innovation Fund — 25 startups, 8 commercialized",
            "QSTP Partnership — Tech transfer and startup scouting program"
          ]
        ]});
        break;

      case "why_brinc":
        sections.push({ type: "why_brinc", builder: buildMetrics, args: [
          "Why Brinc",
          [
            { value: "12+", label: "Years running innovation programs" },
            { value: "75+", label: "Programs executed across 20+ countries" },
            { value: "170+", label: "Portfolio companies supported" },
            { value: "$1.69B+", label: "Total portfolio valuation" },
            { value: "20+", label: "Countries with active presence" },
            { value: "Tech", label: "Enabled via VentureVerse platform" }
          ]
        ]});
        break;

      case "next_steps":
        sections.push({ type: "next_steps", builder: buildNumberedList, args: [
          "Next Steps",
          [
            "1. Finalize program scope and commercial terms",
            "2. Sign partnership agreement and mobilize joint team",
            "3. Launch program design and startup scouting (Weeks 1-4)",
            "4. Execute pilot phase with first cohort (Months 2-6)",
            "5. Scale program and transition to long-term operations (Months 7-12)"
          ]
        ]});
        break;

      case "ecosystem":
        sections.push({ type: "ecosystem", builder: buildSectionHeader, args: [
          "The Ecosystem",
          "Brinc's global innovation network",
          [
            "Global network spanning 20+ countries across MENA, Asia, Europe, Americas",
            "Deep UAE/GCC presence with established government and corporate relationships",
            "Cross-sector expertise: AI, climate tech, health tech, fintech, space, manufacturing",
            "Strong investor network for follow-on funding and commercial introductions"
          ]
        ]});
        break;

      case "reporting":
        sections.push({ type: "reporting", builder: buildTwoColumn, args: [
          "Reporting & KPIs",
          "Tracking Metrics",
          ["Applications received", "Selection rate (%)", "Startups funded", "Pilots launched", "Commercial deals signed"],
          "Reporting Cadence",
          ["Weekly: Program team standup", "Monthly: Executive dashboard via VentureVerse", "Quarterly: Business review with stakeholders", "Annual: Impact report and strategic review"]
        ]});
        break;

      case "team":
        sections.push({ type: "team", builder: buildSectionHeader, args: [
          "Program Team",
          "Dedicated Brinc team for program delivery",
          [
            "Program Director: Overall strategy, stakeholder management, governance",
            "Scouting Lead: Startup sourcing, screening, selection process",
            "Mentorship Lead: Founder coaching, mentor network management",
            "Pilot Manager: Pilot design, execution, commercial handover",
            "Platform Analyst: VentureVerse dashboards, reporting, analytics"
          ]
        ]});
        break;

      case "market_opportunity":
        sections.push({ type: "market_opportunity", builder: buildSectionHeader, args: [
          "Market Opportunity",
          "Strong market dynamics support this initiative",
          [
            "Growing startup ecosystem in " + (geo || "the region") + " with increasing investor interest",
            "Government support through innovation-focused policies and funding",
            "Corporate demand for external innovation and startup partnerships",
            "Talent availability: Growing pool of technical founders and operators"
          ]
        ]});
        break;

      case "why_now":
        sections.push({ type: "why_now", builder: buildNumberedList, args: [
          "Why Now",
          [
            "1. Market momentum: Innovation funding at record levels in " + (geo || "the region"),
            "2. Talent availability: Growing pool of experienced startup founders",
            "3. Policy tailwinds: Strong government support for innovation programs",
            "4. First-mover advantage in " + (offerings[0] || "this space") + " before competitors"
          ]
        ]});
        break;

      case "strategic_context":
        sections.push({ type: "strategic_context", builder: buildSectionHeader, args: [
          "Strategic Context",
          "Alignment with national and regional priorities",
          [
            "Aligned with national innovation and economic diversification strategies",
            "Contributes to in-country value creation and knowledge economy development",
            "Supports entrepreneurship ecosystem development and job creation",
            "Positions " + co + " as a leader in innovation and technology adoption"
          ]
        ]});
        break;

      case "opportunity":
        sections.push({ type: "opportunity", builder: buildSectionHeader, args: [
          "The Opportunity",
          "A significant market opportunity for " + co,
          [
            co + " is positioned to capture significant value through structured innovation",
            "Early movers in " + (offerings[0] || "this space") + " are seeing 3-5x returns",
            "Brinc's methodology de-risks the execution and accelerates outcomes"
          ]
        ]});
        break;

      case "venture_building":
        sections.push({ type: "venture_building", builder: buildSectionHeader, args: [
          "Venture Building Model",
          "From idea validation to product launch through co-creation",
          [
            "Phase 1: Ideation and validation — Identify high-potential concepts",
            "Phase 2: Co-creation — Joint development with " + co + " and startup",
            "Phase 3: MVP build — Rapid prototyping and user testing",
            "Phase 4: Launch and scale — Commercial deployment and growth support"
          ]
        ]});
        break;

      case "curriculum":
        sections.push({ type: "curriculum", builder: buildSectionHeader, args: [
          "Program Curriculum",
          "Structured learning modules tailored for " + co,
          [
            "Module 1: AI Strategy & Opportunity Mapping — Identifying AI opportunities",
            "Module 2: Technology Deep Dive — Technical foundations and capabilities",
            "Module 3: Implementation Playbook — Practical deployment frameworks",
            "Module 4: Change Management — Driving adoption within " + co,
            "Module 5: Capstone Project — Hands-on project with real business impact"
          ]
        ]});
        break;

      default:
        // Unknown section type — skip
        break;
    }
  });

  return sections;
}

// ── Main Handler ──────────────────────────────────────────

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.end(JSON.stringify({
      ok: true,
      hasDriveFolder: !!DRIVE_ROOT,
      availableArchetypes: Object.keys(ARCHETYPES)
    }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  var body = req.body || {};
  var accessToken = body.accessToken;
  var refreshToken = body.refreshToken || "";

  if (!accessToken) {
    return res.end(JSON.stringify({ ok: false, error: "Missing accessToken" }));
  }

  var prospectCompany = body.prospectCompany || body.prospectName || "Partner";
  var prospectName = body.prospectName || "";
  var offerings = body.offerings || [];
  var suggestedAngle = body.suggestedAngle || "";
  var includeOverview = body.includeOverview;
  var includeCaseStudies = body.includeCaseStudies;
  var archetypeKey = body.archetype || "accelerator";
  var geo = body.geography || "";

  var logs = [];
  var title = prospectCompany + " x Brinc";

  // Resolve archetype
  var arch = ARCHETYPES[archetypeKey] || ARCHETYPES.accelerator;
  logs.push("Archetype: " + archetypeKey + " (" + arch.label + ")");
  logs.push("Sections: " + arch.sectionOrder.join(", "));

  // Token refresh
  var tokenPromise = Promise.resolve();
  if (refreshToken) {
    tokenPromise = gapi(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken).then(function(check) {
      if (!check.ok) {
        return fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID || "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
            grant_type: "refresh_token"
          }),
        }).then(function(r) { return r.json(); }).then(function(d) {
          if (d.access_token) accessToken = d.access_token;
        });
      }
    });
  }

  tokenPromise.then(function() {
    // Create presentation
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations", {
      method: "POST",
      body: JSON.stringify({ title: title }),
    });
  }).then(function(created) {
    if (!created.ok) throw new Error(created.data.error ? created.data.error.message : "Create failed");
    var presId = created.data.presentationId;
    logs.push("Created presentation: " + presId);

    // Generate content plan
    var sections = generateContent(arch, prospectCompany, offerings, suggestedAngle, geo);
    logs.push("Generated " + sections.length + " sections");

    // Build all slide requests
    var now = Date.now();
    var slideIdx = 0;
    var allReqs = [];
    var sectionMap = [];

    sections.forEach(function(sec) {
      var sid = "s" + now + "_" + slideIdx;
      slideIdx++;

      // Call the builder
      var builderArgs = [sid].concat(sec.args || []);
      var reqs = sec.builder.apply(null, builderArgs);
      allReqs = allReqs.concat(reqs);

      sectionMap.push({ type: sec.type, slideIndex: slideIdx });
    });

    logs.push("Total API requests: " + allReqs.length);

    // Apply batchUpdate
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: allReqs }),
    }).then(function(batch) {
      if (!batch.ok) {
        // Clean up on failure
        fetch("https://www.googleapis.com/drive/v3/files/" + presId, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + accessToken }
        }).catch(function(){});
        throw new Error(batch.data.error ? batch.data.error.message : "Batch failed");
      }

      logs.push("Batch applied: " + allReqs.length + " requests");

      // Folder move
      var folderPath = "";
      if (DRIVE_ROOT) {
        return gapi(accessToken, "https://www.googleapis.com/drive/v3/files/" + presId + "?fields=parents&supportsAllDrives=true")
          .then(function(before) {
            var currentParents = before.data.parents || ["root"];
            var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='01 Generated Proposals' and trashed=false");
            return gapi(accessToken, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,createdTime)&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
              .then(function(search) {
                var found = search.data.files || [];
                if (found[0]) { logs.push("Reusing folder: " + found[0].id); return found[0].id; }
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
  }).then(function(result) {
    res.end(JSON.stringify(result));
  }).catch(function(err) {
    console.error("[Slides]", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message, logs: logs }));
  });
}
