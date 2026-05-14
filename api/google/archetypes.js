// ═══════════════════════════════════════════════════════════
//  BRINC DECK INTELLIGENCE — ARCHETYPE ENGINE
//  ═══════════════════════════════════════════════════════════
//  Defines deck archetypes, slide type taxonomy, content
//  patterns, and classification logic for retrieval-augmented
//  proposal generation.
// ═══════════════════════════════════════════════════════════

// ── 1. DECK ARCHETYPE TAXONOMY ──────────────────────────

const DECK_ARCHETYPES = {
  accelerator: {
    label: "Accelerator Program",
    description: "Multi-phase startup acceleration with cohort-based intake",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "challenge_framing",
      "objectives", "ecosystem", "approach", "scouting", "startup_support",
      "pilot_execution", "commercialization", "timeline", "reporting",
      "case_study", "team", "why_brinc", "next_steps"
    ],
    signals: ["accelerator", "cohort", "startup", "intake", "batch", "program", "founder", "scale", "growth", "mentor"],
    offerings: ["Accelerator Program Design", "Startup Scouting & Selection", "Mentorship & Founder Coaching",
                "Pilot Execution & Commercialization", "Demo Day & Investor Access"],
    tone: "confident_execution",
    typicalDuration: "12-16 weeks",
    geography: "global"
  },

  incubator: {
    label: "Incubator / Venture Building",
    description: "Deep venture building with idea-to-launch support",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "opportunity",
      "approach", "venture_building", "scouting", "pilot_execution",
      "commercialization", "timeline", "case_study", "team", "next_steps"
    ],
    signals: ["incubator", "venture building", "venture studio", "idea validation", "product build", "co-create", "mvp", "launch"],
    offerings: ["Incubator / Venture Building", "Startup Scouting & Selection", "Pilot Execution & Commercialization"],
    tone: "innovation_partner",
    typicalDuration: "6-12 months",
    geography: "global"
  },

  soft_landing: {
    label: "Soft Landing / Market Entry",
    description: "Helping international companies enter UAE/GCC market",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "market_opportunity",
      "ecosystem", "approach", "scouting", "startup_support", "commercialization",
      "timeline", "case_study", "why_brinc", "next_steps"
    ],
    signals: ["soft landing", "market entry", "gcc", "uae", "establish", "localize", "expand", "set up", "office"],
    offerings: ["Soft Landing / Market Entry", "Startup Scouting & Selection", "Strategic Consulting"],
    tone: "market_expert",
    typicalDuration: "Ongoing",
    geography: "uae_gcc"
  },

  sandbox: {
    label: "Sandbox / Regulator Program",
    description: "Regulatory sandbox for fintech, healthtech, climate",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "challenge_framing",
      "regulatory_context", "approach", "scouting", "pilot_execution",
      "reporting", "timeline", "case_study", "team", "next_steps"
    ],
    signals: ["sandbox", "regulator", "compliance", "regulatory", "fintech", "license", "testing", "framework", "pilot"],
    offerings: ["Startup Scouting & Selection", "Pilot Execution & Commercialization", "Strategic Consulting"],
    tone: "authority_confidence",
    typicalDuration: "12-24 months",
    geography: "uae_gcc"
  },

  innovation_challenge: {
    label: "Innovation Challenge",
    description: "Time-bounded innovation competition with prizes",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "challenge_statement",
      "approach", "scouting", "selection", "startup_support", "pilot_execution",
      "awards", "timeline", "case_study", "next_steps"
    ],
    signals: ["challenge", "hackathon", "competition", "prize", "solve", "problem", "contest", "award", "winner"],
    offerings: ["Startup Scouting & Selection", "Pilot Execution & Commercialization", "Demo Day & Investor Access"],
    tone: "energy_urgency",
    typicalDuration: "3-6 months",
    geography: "global"
  },

  corporate_innovation: {
    label: "Corporate Innovation",
    description: "Helping corporations build innovation capabilities",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "challenge_framing",
      "objectives", "approach", "scouting", "startup_support",
      "pilot_execution", "commercialization", "reporting", "case_study",
      "team", "why_brinc", "next_steps"
    ],
    signals: ["corporate", "enterprise", "innovation lab", "transform", "digital", "disruption", "r&d", "strategic"],
    offerings: ["Corporate Innovation", "Startup Scouting & Selection", "Strategic Consulting", "VentureVerse Platform"],
    tone: "executive_partner",
    typicalDuration: "6-12 months",
    geography: "global"
  },

  ai_training: {
    label: "AI / Corporate Training",
    description: "AI-focused training programs for executives and teams",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "why_now",
      "ecosystem", "approach", "curriculum", "timeline",
      "case_study", "team", "next_steps"
    ],
    signals: ["ai", "artificial intelligence", "training", "workshop", "capacity building", "upskill", "education", "learning"],
    offerings: ["Strategic Consulting", "Corporate Innovation"],
    tone: "thought_leader",
    typicalDuration: "4-8 weeks",
    geography: "global"
  },

  government_capability: {
    label: "Government Capability Building",
    description: "Building innovation ecosystem capacity for government bodies",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "strategic_context",
      "objectives", "approach", "ecosystem", "scouting", "startup_support",
      "reporting", "case_study", "team", "why_brinc", "next_steps"
    ],
    signals: ["government", "ministry", "department", "authority", "capacity", "ecosystem building", "smart city", "vision 2030", "d33"],
    offerings: ["Government Partnership", "Startup Scouting & Selection", "Strategic Consulting", "VentureVerse Platform"],
    tone: "government_partner",
    typicalDuration: "12-24 months",
    geography: "uae_gcc"
  },

  executive_workshop: {
    label: "Executive Workshop",
    description: "Focused workshop for senior stakeholders",
    sectionOrder: [
      "cover", "title_sentence", "objectives", "agenda",
      "approach", "case_study", "next_steps"
    ],
    signals: ["workshop", "executive", "board", "stakeholder", "session", "retreat", "deep dive", "strategy"],
    offerings: ["Strategic Consulting"],
    tone: "executive_partner",
    typicalDuration: "1-3 days",
    geography: "global"
  },

  venture_building: {
    label: "Venture Building",
    description: "Building ventures from zero with co-creation model",
    sectionOrder: [
      "cover", "title_sentence", "executive_summary", "opportunity",
      "approach", "venture_building", "scouting", "pilot_execution",
      "commercialization", "timeline", "case_study", "team", "next_steps"
    ],
    signals: ["venture", "venture building", "co-creation", "studio", "spin out", "build", "launch"],
    offerings: ["Incubator / Venture Building", "Startup Scouting & Selection"],
    tone: "innovation_partner",
    typicalDuration: "6-12 months",
    geography: "global"
  }
};

// ── 2. SLIDE TYPE TAXONOMY ──────────────────────────────

const SLIDE_TYPES = {
  cover: {
    label: "Cover",
    description: "Partnership cover with Brinc branding",
    signals: ["brinc", "proposal", "partnership", "confidential", "presentation"],
    layout: "full_bleed_brand",
    requiredElements: ["partner_name", "brinc_logo", "date"],
    contentPattern: "[Partner] x Brinc | Partnership Proposal | [Date]"
  },

  title_sentence: {
    label: "Title Sentence",
    description: "A single sentence summarizing the opportunity",
    signals: ["title", "opportunity", "building", "creating", "enabling", "launching", "accelerating"],
    layout: "centered_text",
    requiredElements: ["single_sentence", "branding_accent"],
    contentPattern: "A title sentence that captures the essence of the proposal in one powerful statement."
  },

  executive_summary: {
    label: "Executive Summary",
    description: "One-page summary for senior decision makers",
    signals: ["executive summary", "overview", "at a glance", "snapshot", "summary"],
    layout: "structured_overview",
    requiredElements: ["context", "objective", "approach", "deliverables", "timeline"],
    contentPattern: "Structured summary with key facts and figures."
  },

  challenge_framing: {
    label: "Challenge Framing",
    description: "Artfully states the problem/opportunity",
    signals: ["challenge", "problem", "gap", "issue", "obstacle", "barrier", "risk"],
    layout: "statement_with_support",
    requiredElements: ["challenge_statement", "supporting_data"],
    contentPattern: "The challenge is... This matters because..."
  },

  objectives: {
    label: "Objectives",
    description: "Clear, measurable program objectives",
    signals: ["objective", "goal", "aim", "target", "kpi", "outcome", "metric"],
    layout: "numbered_list",
    requiredElements: ["numbered_objectives", "success_criteria"],
    contentPattern: "1. Objective one with measurable outcome. 2. Objective two..."
  },

  why_now: {
    label: "Why Now",
    description: "Urgency and timeliness argument",
    signals: ["why now", "timely", "urgency", "momentum", "window", "moment", "now"],
    layout: "argumentative",
    requiredElements: ["market_signals", "urgency_factors"],
    contentPattern: "Three reasons why this must happen now."
  },

  ecosystem: {
    label: "Ecosystem",
    description: "Market/ecosystem map or overview",
    signals: ["ecosystem", "landscape", "market", "players", "stakeholders", "map", "network"],
    layout: "visual_map_or_diagram",
    requiredElements: ["ecosystem_visual", "key_players"],
    contentPattern: "The ecosystem includes... Key players are..."
  },

  approach: {
    label: "Approach / Methodology",
    description: "How Brinc will execute the program",
    signals: ["approach", "methodology", "how we work", "process", "framework", "model"],
    layout: "phased_diagram",
    requiredElements: ["phases", "activities", "deliverables"],
    contentPattern: "Our approach spans [N] phases: 1. Discover 2. Design 3. Execute 4. Scale"
  },

  phased_roadmap: {
    label: "Phased Roadmap",
    description: "Visual timeline with phases and milestones",
    signals: ["roadmap", "phases", "stage", "milestone", "phase", "wave"],
    layout: "timeline_horizontal",
    requiredElements: ["phases", "milestones", "dates"],
    contentPattern: "Phase 1 (Month 1-3): X | Phase 2 (Month 4-6): Y | Phase 3 (Month 7-12): Z"
  },

  timeline: {
    label: "Timeline",
    description: "Detailed schedule and milestones",
    signals: ["timeline", "schedule", "calendar", "milestone", "deadline", "date"],
    layout: "timeline_horizontal",
    requiredElements: ["dates", "activities", "deliverables"],
    contentPattern: "Month 1-2: X | Month 3-4: Y | Month 5-6: Z"
  },

  funnel: {
    label: "Funnel",
    description: "Startup funnel from intake to graduation",
    signals: ["funnel", "pipeline", "intake", "apply", "screen", "select", "graduate"],
    layout: "funnel_diagram",
    requiredElements: ["stages", "numbers", "criteria"],
    contentPattern: "Apply: 500+ | Screen: 200 | Interview: 100 | Select: 30 | Graduate: 25"
  },

  scouting: {
    label: "Startup Scouting",
    description: "How startups are sourced and selected",
    signals: ["scouting", "sourcing", "selection", "pipeline", "screening", "application", "deal flow"],
    layout: "process_flow",
    requiredElements: ["channels", "criteria", "process"],
    contentPattern: "Scouting through [channels] using [criteria] to select top [N] startups."
  },

  startup_support: {
    label: "Startup Support",
    description: "Services provided to portfolio companies",
    signals: ["support", "mentor", "coach", "founder", "program", "services", "resources"],
    layout: "service_grid",
    requiredElements: ["support_areas", "delivery_method"],
    contentPattern: "Mentorship, coaching, fundraising support, commercial introductions..."
  },

  pilot_execution: {
    label: "Pilot Execution",
    description: "How pilots are designed and run",
    signals: ["pilot", "execution", "test", "trial", "proof of concept", "poc", "mvp"],
    layout: "process_flow",
    requiredElements: ["pilot_design", "success_criteria", "partners"],
    contentPattern: "Pilot design: [approach] | Success criteria: [metrics] | Partners: [list]"
  },

  commercialization: {
    label: "Commercialization",
    description: "Path from pilot to commercial deployment",
    signals: ["commercial", "revenue", "go-to-market", "scale", "deployment", "product", "launch"],
    layout: "pathway_diagram",
    requiredElements: ["pathway", "partners", "metrics"],
    contentPattern: "From pilot to commercial through: [steps]"
  },

  case_study: {
    label: "Case Study",
    description: "Relevant past program results",
    signals: ["case study", "portfolio", "track record", "past", "result", "achievement", "success"],
    layout: "structured_result",
    requiredElements: ["program_name", "results", "testimonial"],
    contentPattern: "[Program Name]: [N] startups, $[X] raised, [Y] pilots"
  },

  reporting: {
    label: "Reporting / KPIs",
    description: "Dashboard and reporting framework",
    signals: ["reporting", "kpi", "dashboard", "metrics", "track", "measure", "monitor"],
    layout: "metrics_grid",
    requiredElements: ["kpis", "reporting_frequency", "tools"],
    contentPattern: "Key metrics: applications, selection rate, funding raised, pilots launched..."
  },

  team: {
    label: "Team",
    description: "Key people on the program",
    signals: ["team", "leadership", "people", "expert", "advisor", "director", "manager"],
    layout: "people_grid",
    requiredElements: ["names", "roles", "photos"],
    contentPattern: "Program Director, Scouting Lead, Mentorship Lead..."
  },

  why_brinc: {
    label: "Why Brinc",
    description: "Differentiator slide for Brinc vs alternatives",
    signals: ["why brinc", "differentiator", "advantage", "unique", "track record", "global"],
    layout: "comparison_or_statement",
    requiredElements: ["key_differentiators", "proof_points"],
    contentPattern: "Global network + tech-enabled platform + proven methodology + 12+ years"
  },

  next_steps: {
    label: "Next Steps",
    description: "Clear action items to move forward",
    signals: ["next step", "action", "get started", "moving forward", "proposal", "commercial"],
    layout: "numbered_actions",
    requiredElements: ["actions", "owners", "timelines"],
    contentPattern: "1. Finalize scope | 2. Sign agreement | 3. Mobilize team | 4. Launch"
  },

  market_opportunity: {
    label: "Market Opportunity",
    description: "Market size and growth opportunity",
    signals: ["market", "tam", "sam", "opportunity", "growth", "size", "addressable"],
    layout: "market_data",
    requiredElements: ["market_size", "growth_rate", "key_trends"],
    contentPattern: "TAM: $X | SAM: $Y | Growth: Z% CAGR"
  },

  regulatory_context: {
    label: "Regulatory Context",
    description: "Regulatory landscape and compliance framework",
    signals: ["regulatory", "regulation", "compliance", "framework", "license", "sandbox"],
    layout: "structured_overview",
    requiredElements: ["regulatory_body", "framework", "requirements"],
    contentPattern: "Regulated by [body] under [framework]. Key requirements: ..."
  },

  opportunity: {
    label: "Opportunity",
    description: "Market or business opportunity statement",
    signals: ["opportunity", "market", "chance", "potential", "gap"],
    layout: "statement_with_data",
    requiredElements: ["opportunity_statement", "supporting_data"],
    contentPattern: "There is a significant opportunity to..."
  },

  venture_building: {
    label: "Venture Building",
    description: "Co-creation and venture building approach",
    signals: ["venture building", "co-creation", "build", "studio", "product"],
    layout: "process_flow",
    requiredElements: ["stages", "co_creation_model"],
    contentPattern: "From idea validation to product launch through co-creation."
  },

  challenge_statement: {
    label: "Challenge Statement",
    description: "Problem statement for innovation challenges",
    signals: ["challenge", "problem statement", "solve", "question", "call"],
    layout: "centered_statement",
    requiredElements: ["challenge_text", "criteria"],
    contentPattern: "How might we [challenge]?"
  },

  awards: {
    label: "Awards & Prizes",
    description: "Incentive structure for challenges",
    signals: ["prize", "award", "winner", "incentive", "reward", "grant"],
    layout: "prize_tiers",
    requiredElements: ["prize_amounts", "criteria", "timeline"],
    contentPattern: "Grand Prize: $X | Runner Up: $Y | People's Choice: $Z"
  },

  curriculum: {
    label: "Curriculum",
    description: "Training curriculum overview",
    signals: ["curriculum", "module", "training content", "syllabus", "learning"],
    layout: "module_grid",
    requiredElements: ["modules", "duration", "format"],
    contentPattern: "Module 1: X | Module 2: Y | Module 3: Z"
  },

  strategic_context: {
    label: "Strategic Context",
    description: "National strategy alignment (Vision 2030, D33, etc.)",
    signals: ["strategic", "vision", "d33", "we the uae", "national", "agenda", "strategy"],
    layout: "alignment_diagram",
    requiredElements: ["national_strategy", "alignment_points"],
    contentPattern: "Aligned with [National Strategy] through..."
  }
};

// ── 3. CONTENT PATTERNS ─────────────────────────────────

const CONTENT_PATTERNS = {
  // Brinc-specific phrasing
  recurring_phrases: [
    "we are Brinc", "Brinc's approach", "globally proven methodology",
    "tech-enabled platform", "data-driven selection", "co-creation model",
    "end-to-end support", "venture building", "innovation programs",
    "startup ecosystem", "commercial outcomes", "pilot execution"
  ],

  // Tone indicators
  tones: {
    confident_execution: { adjectives: ["proven", "executed", "delivered", "achieved"], verbs: ["drive", "execute", "deliver", "accelerate"] },
    innovation_partner: { adjectives: ["innovative", "disruptive", "cutting-edge", "transformative"], verbs: ["build", "create", "co-create", "innovate"] },
    market_expert: { adjectives: ["deep", "local", "established", "connected"], verbs: ["navigate", "bridge", "connect", "establish"] },
    government_partner: { adjectives: ["strategic", "aligned", "committed", "long-term"], verbs: ["enable", "empower", "support", "facilitate"] },
    executive_partner: { adjectives: ["world-class", "benchmark", "best-in-class", "tailored"], verbs: ["advise", "consult", "partner", "guide"] },
    thought_leader: { adjectives: ["thought-leading", "insights-driven", "forward-looking"], verbs: ["educate", "enable", "transform", "lead"] },
    authority_confidence: { adjectives: ["regulated", "compliant", "secure", "robust"], verbs: ["govern", "regulate", "validate", "certify"] }
  },

  // UAE / Government positioning language
  uae_positioning: [
    "aligned with UAE Vision",
    "contributes to Dubai D33",
    "supports the National In-Country Value (ICV) program",
    "Advancing Abu Dhabi Economic Vision",
    "empowers Emirati founders",
    "in-country value creation",
    "part of the UAE's innovation ecosystem",
    "Dubai's strategic priority",
    "positioning UAE as a global hub"
  ],

  // Title sentence starters (Brinc convention)
  title_sentence_patterns: [
    "Building [X] with [Partner] to [Outcome]",
    "Accelerating [Sector] innovation through [Mechanism]",
    "Enabling [Partner] to [Action] via [Brinc Capability]",
    "Co-creating [Program] for [Market] with [Partner]",
    "Launching [Initiative] to drive [Outcome] in [Geography]",
    "Partnering with [Partner] to build [Capability]",
    "A [Descriptor] approach to [Challenge] in [Geography]"
  ],

  // Why Brinc patterns
  why_brinc_patterns: [
    "12+ years of experience running innovation programs",
    "75+ programs executed across 20+ countries",
    "170+ portfolio companies supported",
    "$1.69B+ total portfolio valuation",
    "Tech-enabled through VentureVerse platform",
    "Global network with deep local expertise",
    "End-to-end: from scouting to commercialization",
    "Data-driven startup selection and portfolio management",
    "Proven methodology with measurable outcomes",
    "Local team + global network model"
  ],

  // Section header patterns (Brinc's visual style)
  section_headers: {
    simple_bold: "Bold navy title, 28-32pt, left-aligned",
    with_accent_bar: "Title + colored accent bar underneath (80px wide, 4px tall)",
    with_subtitle: "Title + light gray subtitle below",
    statement_style: "Large sentence as header, 36-44pt, centered"
  }
};

// ── 4. CLASSIFICATION ENGINE ────────────────────────────

/**
 * Classify a deck based on extracted text from all slides.
 * Returns the best matching archetype key + confidence.
 */
function classifyDeck(slideTexts, fileName) {
  var text = slideTexts.join(" ").toLowerCase();
  var fn = fileName.toLowerCase();
  var scores = {};

  for (var key in DECK_ARCHETYPES) {
    var arch = DECK_ARCHETYPES[key];
    var score = 0;

    // Signal matching
    arch.signals.forEach(function(s) {
      if (text.includes(s)) score += 3;
      if (fn.includes(s)) score += 5;
    });

    // Offering matching (if offerings present in text)
    arch.offerings.forEach(function(o) {
      var ok = o.toLowerCase();
      if (text.includes(ok)) score += 2;
    });

    // Tone word matching
    var tone = CONTENT_PATTERNS.tones[arch.tone];
    if (tone) {
      tone.adjectives.forEach(function(w) { if (text.includes(w)) score += 1; });
      tone.verbs.forEach(function(w) { if (text.includes(w)) score += 1; });
    }

    scores[key] = score;
  }

  // Find best
  var best = null, bestScore = 0;
  for (var k in scores) {
    if (scores[k] > bestScore) { best = k; bestScore = scores[k]; }
  }

  // If no strong match, try to infer from file name
  if (bestScore < 5) {
    for (var ak in DECK_ARCHETYPES) {
      var a = DECK_ARCHETYPES[ak];
      if (a.signals.some(function(s) { return fn.includes(s); })) {
        if (!best || scores[ak] >= bestScore) { best = ak; bestScore = scores[ak] || 5; }
      }
    }
  }

  // Default
  if (!best) best = "accelerator";

  // Calculate confidence (0-1)
  var totalScore = 0;
  for (var sk in scores) totalScore += scores[sk];
  var confidence = totalScore > 0 ? bestScore / totalScore : 0;

  return { archetype: best, confidence: confidence, scores: scores };
}

/**
 * Classify a single slide based on its text content.
 * Returns the best matching slide type key + evidence.
 */
function classifySlide(texts) {
  var fullText = texts.join(" ").toLowerCase();
  var scores = {};

  for (var key in SLIDE_TYPES) {
    var st = SLIDE_TYPES[key];
    var score = 0;

    st.signals.forEach(function(s) {
      if (fullText.includes(s)) score += 3;
    });

    // Boost for exact phrase matches
    if (st.contentPattern) {
      var patternWords = st.contentPattern.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
      patternWords.forEach(function(pw) {
        if (fullText.includes(pw)) score += 1;
      });
    }

    scores[key] = score;
  }

  var best = null, bestScore = 0;
  for (var k in scores) {
    if (scores[k] > bestScore) { best = k; bestScore = scores[k]; }
  }

  // Default to "content" if no match
  if (!best || bestScore === 0) best = "content";

  return {
    type: best,
    label: (SLIDE_TYPES[best] && SLIDE_TYPES[best].label) || best,
    confidence: bestScore,
    scores: scores,
  };
}

/**
 * Given proposal context, determine the best archetype and
 * return a tailored section order + content templates.
 */
function generateProposalStructure(proposalType, offerings, prospectCompany, sector, geography) {
  // Determine archetype
  var archetypeKey = "accelerator"; // default

  // Map offerings to archetype
  var offeringText = offerings.join(" ").toLowerCase();
  for (var ak in DECK_ARCHETYPES) {
    var a = DECK_ARCHETYPES[ak];
    if (a.offerings.some(function(o) { return offeringText.includes(o.toLowerCase()); })) {
      var matchCount = a.offerings.filter(function(o) { return offeringText.includes(o.toLowerCase()); }).length;
      if (matchCount >= 2) { archetypeKey = ak; break; }
    }
  }

  // Override by sector keywords
  if (sector) {
    var s = sector.toLowerCase();
    if (s.includes("government") || s.includes("ministry") || s.includes("authority")) archetypeKey = "government_capability";
    else if (s.includes("corporate") || s.includes("enterprise")) archetypeKey = "corporate_innovation";
    else if (s.includes("ai") || s.includes("training")) archetypeKey = "ai_training";
    else if (s.includes("sandbox") || s.includes("regulator")) archetypeKey = "sandbox";
  }

  // Override by geography
  var geo = (geography || "").toLowerCase();
  if (geo.includes("uae") || geo.includes("gcc")) {
    // Enhance with UAE-specific positioning
  }

  var archetype = DECK_ARCHETYPES[archetypeKey];

  // Build section list with content templates
  var sections = [];
  var seenTypes = new Set();

  archetype.sectionOrder.forEach(function(slideTypeKey) {
    // Skip duplicates
    if (seenTypes.has(slideTypeKey)) return;
    seenTypes.add(slideTypeKey);

    var st = SLIDE_TYPES[slideTypeKey];
    if (!st) return;

    // Filter out experience/case studies if not requested
    if (slideTypeKey === "case_study" && !offerings.some(function(o) { return o.toLowerCase().includes("case"); })) {
      // Still include case_study - it's part of the archetype
    }

    var section = {
      type: slideTypeKey,
      label: st.label,
      layout: st.layout,
      contentTemplate: st.contentPattern,
      requiredElements: st.requiredElements,
    };

    // Generate contextual content
    section.generatedContent = generateSlideContent(section, archetype, prospectCompany, offerings, geo);

    sections.push(section);
  });

  return {
    archetype: archetypeKey,
    archetypeLabel: archetype.label,
    sections: sections,
    tone: archetype.tone,
    typicalDuration: archetype.typicalDuration,
  };
}

function generateSlideContent(section, archetype, prospectCompany, offerings, geography) {
  var co = prospectCompany || "Partner";
  var off = offerings.length > 0 ? offerings.join(", ") : "innovation program";

  switch (section.type) {
    case "cover":
      return { title: co + " x Brinc", subtitle: "Partnership Proposal", date: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }) };

    case "title_sentence":
      var patterns = CONTENT_PATTERNS.title_sentence_patterns;
      var p = patterns[Math.floor(Math.random() * patterns.length)];
      return { text: p.replace(/\[Partner\]/g, co).replace(/\[Brinc Capability\]/g, off).replace(/\[Outcome\]/g, "drive innovation").replace(/\[Sector\]/g, "sector").replace(/\[Geography\]/g, geography || "the region") };

    case "executive_summary":
      return {
        context: "Brinc and " + co + " are exploring a partnership to " + off.toLowerCase() + ".",
        objective: "Launch a " + archetype.typicalDuration + " program that delivers measurable outcomes.",
        approach: "Leverage Brinc's " + archetype.label.toLowerCase() + " methodology and global network.",
        deliverables: offerings.map(function(o) { return "- " + o; }),
        timeline: archetype.typicalDuration
      };

    case "challenge_framing":
      return {
        statement: co + " faces an opportunity to accelerate innovation through structured " + off.toLowerCase() + ".",
        evidence: "Market signals indicate strong demand for " + (offerings[0] || "innovation") + " in " + (geography || "the region") + "."
      };

    case "objectives":
      return [
        "1. Design and launch a " + archetype.label.toLowerCase() + " within " + archetype.typicalDuration,
        "2. Source and select top-tier startups aligned with " + co + "'s strategic priorities",
        "3. Execute pilots that demonstrate measurable commercial outcomes",
        "4. Build sustainable innovation capabilities within " + co
      ];

    case "approach":
      return [
        "Phase 1 — Discover: Diagnostic assessment and program design",
        "Phase 2 — Design: Co-create program structure, criteria, and governance",
        "Phase 3 — Execute: Run full program with Brinc's global team and platform",
        "Phase 4 — Scale: Transition to sustainable, long-term operation"
      ];

    case "scouting":
      return [
        "Global sourcing through Brinc's network of 20+ countries",
        "Data-driven selection using VentureVerse assessment tools",
        "Multi-channel outreach: events, referrals, direct applications",
        "Rigorous screening: application review, interviews, due diligence",
        "Target: Top 1-3% of applicants based on fit and potential"
      ];

    case "startup_support":
      return [
        "Mentorship: 1:1 sessions with domain experts and serial founders",
        "Fundraising: Investor introductions and pitch preparation",
        "Commercial: Pilot design, contract negotiation, procurement support",
        "Technical: Product development guidance and technology assessment",
        "VentureVerse: Platform access for progress tracking and analytics"
      ];

    case "pilot_execution":
      return [
        "Structured 12-16 week pilot sprints with clear milestones",
        "Success criteria defined upfront with measurable KPIs",
        "Regular reporting and stakeholder alignment sessions",
        "Go/no-go decision framework at each gate"
      ];

    case "timeline":
      return [
        "Months 1-2: Program design, team mobilization, scouting launch",
        "Months 3-4: Startup selection, onboarding, pilot design",
        "Months 5-8: Pilot execution, milestone reviews, iteration",
        "Months 9-12: Commercialization, scale planning, handover"
      ];

    case "case_study":
      return [
        "Dubai DET / Hi2 Incubator — 40+ startups, $12M+ raised, 8 pilots launched",
        "EDB Manufacturing Accelerator — 15 startups, 5 commercial pilots",
        "MBRIF Innovation Fund — 25 startups, 8 commercialized",
        "QSTP Partnership — Tech transfer and startup scouting"
      ];

    case "reporting":
      return [
        "Monthly executive dashboards via VentureVerse",
        "Quarterly business reviews with program stakeholders",
        "Startup scorecards: traction, funding, commercial progress",
        "Portfolio analytics: diversity, geographic spread, sector mix"
      ];

    case "why_brinc":
      return CONTENT_PATTERNS.why_brinc_patterns.slice(0, 5);

    case "next_steps":
      return [
        "1. Finalize program scope and commercial terms",
        "2. Sign partnership agreement and mobilize teams",
        "3. Launch scouting and program design (Week 1-4)",
        "4. Execute pilot phase with first cohort (Months 2-6)",
        "5. Scale program and transition operations (Months 7-12)"
      ];

    case "ecosystem":
      return [
        "Global innovation network spanning 20+ countries",
        "Deep UAE/GCC presence with local expertise",
        "Cross-sector coverage: AI, climate, health, fintech, space",
        "Strong government and corporate partnerships",
        "Proven track record of ecosystem building"
      ];

    case "why_now":
      return [
        "Market momentum: Innovation funding at all-time highs in " + (geography || "the region"),
        "Talent availability: Growing startup talent pool",
        "Government support: Strong policy tailwinds",
        "Competitive urgency: First-mover advantage in " + (offerings[0] || "this space")
      ];

    default:
      return { text: section.contentTemplate || "[Content for " + section.label + "]" };
  }
}

/**
 * Extract recurring phrases from a corpus of texts.
 */
function extractRecurringPhrases(texts, minCount) {
  minCount = minCount || 2;
  var allText = texts.join(" ").toLowerCase();
  var words = allText.split(/\s+/).filter(function(w) { return w.length > 3; });
  var phrases = {};

  for (var i = 0; i < words.length - 1; i++) {
    var phrase = words[i] + " " + words[i + 1];
    // Filter common stop-phrases
    if (["this is", "that the", "with the", "for the", "from the", "will be", "has been"].includes(phrase)) continue;
    phrases[phrase] = (phrases[phrase] || 0) + 1;
  }

  for (var j = 0; j < words.length - 2; j++) {
    var triPhrase = words[j] + " " + words[j + 1] + " " + words[j + 2];
    if (phrases[triPhrase] === undefined) phrases[triPhrase] = 0;
    phrases[triPhrase]++;
  }

  return Object.entries(phrases)
    .filter(function(e) { return e[1] >= minCount; })
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 20);
}

/**
 * Find the most similar historical deck given proposal context.
 */
function findSimilarDeck(scannedDecks, archetype, offerings) {
  var best = null, bestScore = 0;

  scannedDecks.forEach(function(deck) {
    var score = 0;
    if (deck.archetype === archetype) score += 10;
    if (deck.sectionFlow) {
      // Check overlap in offerings
      var deckOfferings = (deck.offerings || []).join(" ").toLowerCase();
      offerings.forEach(function(o) {
        if (deckOfferings.includes(o.toLowerCase())) score += 3;
      });
    }
    if (score > bestScore) { best = deck; bestScore = score; }
  });

  return best;
}

// ═══════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════

export {
  DECK_ARCHETYPES,
  SLIDE_TYPES,
  CONTENT_PATTERNS,
  classifyDeck,
  classifySlide,
  generateProposalStructure,
  generateSlideContent,
  extractRecurringPhrases,
  findSimilarDeck
};
