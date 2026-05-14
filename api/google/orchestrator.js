// ═══════════════════════════════════════════════════════════
//  BRINC PROPOSAL ORCHESTRATOR
//  Post-call quick-hitter proposal assembly.
//  NOT full autonomous generation.
//  Consultant cognition + institutional memory.
// ═══════════════════════════════════════════════════════════

// ── 1. INTAKE INTERPRETER ────────────────────────────────

function interpretIntake(inputs) {
  var co = inputs.prospectCompany || inputs.prospectName || "Partner";
  var offerings = inputs.offerings || [];
  var angle = inputs.suggestedAngle || "";
  var archetype = inputs.archetype || "accelerator";
  var geo = inputs.geography || "";
  var notes = inputs.otherNotes || "";

  // Normalize geography signals
  var geoSignals = { uae: false, gcc: false, global: false };
  var geoLower = geo.toLowerCase();
  if (geoLower.includes("uae") || geoLower.includes("dubai") || geoLower.includes("abudhabi")) geoSignals.uae = true;
  if (geoLower.includes("gcc") || geoLower.includes("saudi") || geoLower.includes("ksa") || geoLower.includes("bahrain") || geoLower.includes("oman")) geoSignals.gcc = true;
  if (geoLower.includes("global") || !geo) geoSignals.global = true;

  // Infer customer type from company name + notes
  var customerType = "corporate";
  var notesLower = (angle + " " + notes).toLowerCase();
  if (notesLower.includes("ministry") || notesLower.includes("government") || notesLower.includes("authority") || notesLower.includes("department")) customerType = "government";
  else if (notesLower.includes("corporate") || notesLower.includes("enterprise")) customerType = "corporate";
  else if (notesLower.includes("startup") || notesLower.includes("founder")) customerType = "startup_ecosystem";

  // Infer urgency
  var urgency = "standard";
  if (notesLower.includes("urgent") || notesLower.includes("asap") || notesLower.includes("q1") || notesLower.includes("q2") || notesLower.includes("this quarter")) urgency = "high";
  if (notesLower.includes("exploratory") || notesLower.includes("future") || notesLower.includes("next year")) urgency = "low";

  // Infer tone from archetype
  var tone = "confident_operator";
  var toneMap = {
    accelerator: "confident_execution",
    incubator: "innovation_partner",
    soft_landing: "market_expert",
    sandbox: "authority_confidence",
    innovation_challenge: "energy_urgency",
    corporate_innovation: "executive_partner",
    ai_training: "thought_leader",
    government_capability: "government_partner",
    executive_workshop: "executive_partner",
    venture_building: "innovation_partner",
  };
  tone = toneMap[archetype] || tone;

  // Infer hidden goals from notes
  var hiddenGoals = [];
  if (notesLower.includes("innovation")) hiddenGoals.push("build innovation capability");
  if (notesLower.includes("startup") || notesLower.includes("founder")) hiddenGoals.push("access startup ecosystem");
  if (notesLower.includes("digital") || notesLower.includes("transform")) hiddenGoals.push("digital transformation");
  if (notesLower.includes("talent") || notesLower.includes("skills")) hiddenGoals.push("talent development");
  if (notesLower.includes("revenue") || notesLower.includes("commercial")) hiddenGoals.push("revenue/commercial outcomes");
  if (notesLower.includes("reputation") || notesLower.includes("position")) hiddenGoals.push("market positioning");
  if (notesLower.includes("government") || notesLower.includes("national")) hiddenGoals.push("national agenda alignment");
  if (hiddenGoals.length === 0) hiddenGoals.push("explore partnership opportunity");

  return {
    prospectCompany: co,
    offerings: offerings,
    archetype: archetype,
    geography: geo,
    customerType: customerType,
    urgency: urgency,
    tone: tone,
    hiddenGoals: hiddenGoals,
    geoSignals: geoSignals,
    rawNotes: angle + "\n" + notes,
  };
}

// ── 2. STRATEGIC ANGLE ENGINE ────────────────────────────

function generateStrategicAngle(intake) {
  var co = intake.prospectCompany;
  var archetype = intake.archetype;
  var offerings = intake.offerings;
  var geo = intake.geography;
  var goals = intake.hiddenGoals;
  var tone = intake.tone;

  // Archetype-specific thesis templates
  var thesisTemplates = {
    accelerator: "Building a {offering} with {company} to accelerate {goal} through structured startup programs",
    incubator: "Co-creating a venture-building program with {company} to validate and launch new concepts",
    soft_landing: "Enabling {company} to access the {geo} startup ecosystem through Brinc's market entry infrastructure",
    sandbox: "Designing a regulatory sandbox with {company} to safely pilot innovation in a controlled environment",
    innovation_challenge: "Running a time-bounded innovation challenge with {company} to surface solutions to {goal}",
    corporate_innovation: "Building external innovation capabilities with {company} through structured startup engagement",
    ai_training: "Upskilling {company}'s leadership on AI through practical, hands-on training programs",
    government_capability: "Supporting {company}'s innovation agenda through ecosystem building and program execution",
    executive_workshop: "Designing a focused executive workshop for {company} on {goal}",
    venture_building: "Partnering with {company} to co-create and launch new ventures from idea to market",
  };

  var offeringStr = offerings.length > 0 ? offerings[0] : "innovation program";
  var goalStr = goals[0];
  var geoStr = geo || "regional";

  var thesis = (thesisTemplates[archetype] || thesisTemplates.accelerator)
    .replace(/{offering}/g, offeringStr)
    .replace(/{company}/g, co)
    .replace(/{goal}/g, goalStr)
    .replace(/{geo}/g, geoStr);

  // Why now — archetype-specific
  var whyNow = generateWhyNow(archetype, geo, offerings);

  // Core tension
  var tension = generateTension(archetype, co, goals);

  // Brinc's role
  var brincRole = generateBrincRole(archetype, offerings);

  // Desired reader belief
  var desiredBelief = "Brinc is the right partner to execute this — they have done it before, they have the methodology, and they understand " + co + "'s context.";

  // Things to avoid
  var avoid = ["Generic capability statements", "Over-promising timelines", "Ignoring " + co + "'s specific context", " sounding like a template"];

  return {
    thesis: thesis,
    whyNow: whyNow,
    tension: tension,
    brincRole: brincRole,
    desiredBelief: desiredBelief,
    avoid: avoid,
    tone: tone,
  };
}

function generateWhyNow(archetype, geo, offerings) {
  var geoStr = geo || "the region";
  var whys = {
    accelerator: ["Startup talent pool in " + geoStr + " is at an all-time high", "Government funding for innovation programs has increased", "Corporate demand for external R&D is accelerating"],
    incubator: ["Internal R&D timelines are too slow for market speed", "Venture building is proven to de-risk new concepts", "Talent and capital are available now"],
    soft_landing: ["International startups are actively seeking " + geoStr + " entry", "Regulatory frameworks are more welcoming than ever", "First-mover advantage in key sectors"],
    sandbox: ["Regulators need structured innovation pathways", "Industry demands safe testing environments", "Policy windows are open now"],
    innovation_challenge: ["Problems are well-defined but solutions are scarce", "Public and private appetite for open innovation is high", "Talent is motivated by mission-driven challenges"],
    corporate_innovation: ["Competitive pressure requires faster innovation cycles", "Startup partnerships are proven to accelerate outcomes", "Leadership is committed to external innovation"],
    ai_training: ["AI is moving from hype to operational reality", "Workforce readiness gaps are widening", "Competitive advantage window is closing"],
    government_capability: ["National agendas require immediate execution", "Ecosystem maturity demands structured programs", "Funding is allocated but execution capacity is limited"],
    executive_workshop: ["Strategic alignment is needed before larger investment", "Executive buy-in requires hands-on exposure", "Quick wins build momentum for scale"],
    venture_building: ["Market gaps are visible but internal capacity is constrained", "Co-creation models reduce risk and increase speed", "Portfolio diversification is a strategic priority"],
  };
  return whys[archetype] || whys.accelerator;
}

function generateTension(archetype, co, goals) {
  var tensions = {
    accelerator: co + " needs to move fast on innovation but lacks the structured startup engagement infrastructure",
    incubator: co + " has ideas but needs a proven methodology to validate and launch them",
    soft_landing: co + " wants to access new markets but navigating local ecosystems is complex",
    sandbox: co + " wants to enable innovation but needs a safe, structured regulatory pathway",
    innovation_challenge: co + " knows the problem but needs fresh thinking from outside their walls",
    corporate_innovation: co + " recognizes the need for external innovation but past efforts lacked structure",
    ai_training: co + "'s leadership knows AI matters but lacks practical understanding of implementation",
    government_capability: co + " has the mandate and funding but needs execution partners with proven methodology",
    executive_workshop: co + " needs strategic alignment before committing to a larger program",
    venture_building: co + " sees market opportunities but building ventures internally is too slow and risky",
  };
  return tensions[archetype] || tensions.accelerator;
}

function generateBrincRole(archetype, offerings) {
  var roles = {
    accelerator: "Design, execute, and manage the full accelerator lifecycle — from scouting to Demo Day",
    incubator: "Co-create ventures — from ideation to product-market fit to launch",
    soft_landing: "Provide on-the-ground infrastructure, network, and guidance for market entry",
    sandbox: "Design the sandbox framework, recruit participants, and manage pilot execution",
    innovation_challenge: "Design the challenge, run outreach, manage submissions, and execute the program",
    corporate_innovation: "Build the innovation operating system — process, tools, and startup pipeline",
    ai_training: "Design curriculum, deliver training, and build internal AI capability",
    government_capability: "Execute programs end-to-end — from design to reporting to handover",
    executive_workshop: "Design and facilitate a focused workshop that drives alignment and action",
    venture_building: "Lead venture creation — from concept validation to launch and scale",
  };
  return roles[archetype] || "Execute the program end-to-end with proven methodology";
}

// ── 3. DYNAMIC SLIDE PLANNER ─────────────────────────────

/**
 * Plan the CLASS A (dynamic strategic) slides.
 * Returns 2-8 slides that need intelligence.
 */
function planDynamicSlides(intake, angle) {
  var archetype = intake.archetype;

  // Archetype-specific strategic slide sequences
  var plans = {
    accelerator: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "challenge_framing", label: "The Opportunity", priority: 2, intelligence: "high" },
      { type: "objectives", label: "Program Objectives", priority: 3, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 4, intelligence: "medium" },
      { type: "scouting", label: "Startup Scouting", priority: 5, intelligence: "medium" },
      { type: "pilot_execution", label: "Pilot Execution", priority: 6, intelligence: "medium" },
      { type: "timeline", label: "Program Timeline", priority: 7, intelligence: "low" },
    ],
    incubator: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "opportunity", label: "The Opportunity", priority: 2, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 3, intelligence: "high" },
      { type: "venture_building", label: "Venture Building Model", priority: 4, intelligence: "high" },
      { type: "scouting", label: "Startup Scouting", priority: 5, intelligence: "medium" },
      { type: "timeline", label: "Timeline", priority: 6, intelligence: "low" },
    ],
    soft_landing: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "market_opportunity", label: "Market Opportunity", priority: 2, intelligence: "high" },
      { type: "ecosystem", label: "Ecosystem", priority: 3, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 4, intelligence: "medium" },
      { type: "scouting", label: "Startup Scouting", priority: 5, intelligence: "medium" },
      { type: "timeline", label: "Timeline", priority: 6, intelligence: "low" },
    ],
    sandbox: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "challenge_framing", label: "The Challenge", priority: 2, intelligence: "high" },
      { type: "regulatory_context", label: "Regulatory Context", priority: 3, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 4, intelligence: "medium" },
      { type: "scouting", label: "Participant Scouting", priority: 5, intelligence: "medium" },
      { type: "pilot_execution", label: "Pilot Framework", priority: 6, intelligence: "medium" },
      { type: "timeline", label: "Timeline", priority: 7, intelligence: "low" },
    ],
    innovation_challenge: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "challenge_statement", label: "Challenge Statement", priority: 2, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 3, intelligence: "high" },
      { type: "scouting", label: "Scouting & Selection", priority: 4, intelligence: "medium" },
      { type: "awards", label: "Awards & Prizes", priority: 5, intelligence: "medium" },
      { type: "timeline", label: "Program Timeline", priority: 6, intelligence: "low" },
    ],
    corporate_innovation: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "challenge_framing", label: "The Challenge", priority: 2, intelligence: "high" },
      { type: "objectives", label: "Objectives", priority: 3, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 4, intelligence: "medium" },
      { type: "scouting", label: "Startup Scouting", priority: 5, intelligence: "medium" },
      { type: "reporting", label: "Reporting Framework", priority: 6, intelligence: "low" },
      { type: "timeline", label: "Timeline", priority: 7, intelligence: "low" },
    ],
    ai_training: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "why_now", label: "Why Now", priority: 2, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 3, intelligence: "medium" },
      { type: "curriculum", label: "Program Curriculum", priority: 4, intelligence: "high" },
      { type: "timeline", label: "Timeline", priority: 5, intelligence: "low" },
    ],
    government_capability: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "strategic_context", label: "Strategic Context", priority: 2, intelligence: "high" },
      { type: "objectives", label: "Objectives", priority: 3, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 4, intelligence: "medium" },
      { type: "ecosystem", label: "Ecosystem", priority: 5, intelligence: "high" },
      { type: "reporting", label: "Reporting Framework", priority: 6, intelligence: "medium" },
      { type: "timeline", label: "Timeline", priority: 7, intelligence: "low" },
    ],
    executive_workshop: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "objectives", label: "Workshop Objectives", priority: 2, intelligence: "high" },
      { type: "approach", label: "Approach & Agenda", priority: 3, intelligence: "medium" },
      { type: "case_study", label: "Relevant Experience", priority: 4, intelligence: "medium" },
    ],
    venture_building: [
      { type: "title_sentence", label: "Title Sentence", priority: 1, intelligence: "high" },
      { type: "opportunity", label: "The Opportunity", priority: 2, intelligence: "high" },
      { type: "approach", label: "Our Approach", priority: 3, intelligence: "high" },
      { type: "venture_building", label: "Venture Building Model", priority: 4, intelligence: "high" },
      { type: "scouting", label: "Scouting", priority: 5, intelligence: "medium" },
      { type: "timeline", label: "Timeline", priority: 6, intelligence: "low" },
    ],
  };

  var slidePlan = plans[archetype] || plans.accelerator;

  // Filter based on intelligence priority and notes context
  // Always include priority 1-3 (the strategic core)
  // Include priority 4-5 if notes suggest relevance
  // Include priority 6-7 if offerings match

  var notesLower = intake.rawNotes.toLowerCase();
  var result = [];

  slidePlan.forEach(function(slide) {
    // Always include top 3
    if (slide.priority <= 3) {
      result.push(slide);
      return;
    }

    // Include medium priority if offerings match
    if (slide.priority <= 5) {
      // Check if offerings are relevant to this slide type
      var isRelevant = isSlideRelevantToOfferings(slide.type, intake.offerings);
      if (isRelevant) result.push(slide);
      return;
    }

    // Include low priority only if explicitly mentioned in notes
    if (slide.priority <= 7 && notesLower.includes(slide.type.replace("_", " "))) {
      result.push(slide);
    }
  });

  // Ensure minimum 2, maximum 8
  if (result.length < 2) result = slidePlan.slice(0, 3);
  if (result.length > 8) result = result.slice(0, 8);

  return result;
}

function isSlideRelevantToOfferings(slideType, offerings) {
  var offeringStr = offerings.join(" ").toLowerCase();
  var relevanceMap = {
    scouting: ["scouting", "sourcing", "selection"],
    startup_support: ["support", "mentor", "founder"],
    pilot_execution: ["pilot", "execution"],
    reporting: ["reporting", "kpi", "dashboard"],
    timeline: [], // always relevant
    curriculum: ["training", "workshop", "education"],
    ecosystem: ["ecosystem", "mapping"],
    awards: ["challenge", "competition"],
  };
  var keywords = relevanceMap[slideType];
  if (!keywords || keywords.length === 0) return true;
  return keywords.some(function(kw) { return offeringStr.includes(kw); });
}

// ── 4. CANONICAL SLIDE APPENDER ──────────────────────────

/**
 * Define which canonical (CLASS B) slides to append after the dynamic slides.
 */
function planCanonicalSlides(archetype) {
  // Universal canonical slides (always appended)
  var universal = [
    { type: "why_brinc", label: "Why Brinc", component: "metrics_grid" },
    { type: "next_steps", label: "Next Steps", component: "section_header" },
  ];

  // Archetype-specific canonical additions
  var archetypeExtras = {
    accelerator: [
      { type: "case_study", label: "Relevant Experience", component: "case_study_card" },
    ],
    incubator: [
      { type: "case_study", label: "Relevant Experience", component: "case_study_card" },
    ],
    soft_landing: [
      { type: "case_study", label: "Market Entry Success", component: "case_study_card" },
    ],
    sandbox: [
      { type: "case_study", label: "Regulatory Experience", component: "case_study_card" },
    ],
    innovation_challenge: [
      { type: "case_study", label: "Past Challenges", component: "case_study_card" },
    ],
    corporate_innovation: [
      { type: "case_study", label: "Corporate Innovation Results", component: "case_study_card" },
    ],
    ai_training: [
      { type: "case_study", label: "Training Results", component: "case_study_card" },
    ],
    government_capability: [
      { type: "case_study", label: "Government Partnerships", component: "case_study_card" },
    ],
    executive_workshop: [],
    venture_building: [
      { type: "case_study", label: "Venture Building Results", component: "case_study_card" },
    ],
  };

  var extras = archetypeExtras[archetype] || [];
  return extras.concat(universal);
}

// ── 5. FINAL POLISH PASS ─────────────────────────────────

var AI_PHRASES = [
  /leverage/gi, /synergy/gi, /holistic/gi, /robust/gi,
  /best[- ]in[- ]class/gi, /world[- ]class/gi, /cutting[- ]edge/gi,
  /groundbreaking/gi, /revolutionary/gi, /unparalleled/gi,
  /in today's fast[- ]paced/gi, /in an ever[- ]changing/gi,
  /at the forefront of/gi, /paving the way/gi,
  /it is worth noting that/gi, /it should be noted that/gi,
  /going forward/gi, /moving forward/gi,
  /we believe that/gi, /we are confident that/gi,
];

var FLUFF_PATTERNS = [
  /^\s*-\s*(we are pleased to|it is our pleasure to|we are excited to)/gi,
  /(significant|substantial|considerable) (value|impact|benefits?) (can be|will be) (achieved|realized|delivered)/gi,
];

/**
 * Polish generated/adapted text to sound like an experienced operator.
 */
function polishText(text) {
  if (!text) return "";

  var polished = text;

  // Remove AI-isms
  AI_PHRASES.forEach(function(pattern) {
    polished = polished.replace(pattern, function(match) {
      // Replace with simpler alternatives
      if (/leverage/i.test(match)) return "use";
      if (/synergy/i.test(match)) return "combination";
      if (/holistic/i.test(match)) return "comprehensive";
      if (/robust/i.test(match)) return "strong";
      if (/best-in-class|world-class/i.test(match)) return "proven";
      if (/cutting-edge|groundbreaking|revolutionary/i.test(match)) return "advanced";
      if (/unparalleled/i.test(match)) return "strong";
      if (/today's fast-paced|ever-changing/i.test(match)) return "current";
      if (/at the forefront of/i.test(match)) return "leading";
      if (/paving the way/i.test(match)) return "enabling";
      if (/it is worth noting that|it should be noted that/i.test(match)) return "";
      if (/going forward|moving forward/i.test(match)) return "";
      if (/we believe that|we are confident that/i.test(match)) return "";
      return "";
    });
  });

  // Remove fluff patterns
  FLUFF_PATTERNS.forEach(function(pattern) {
    polished = polished.replace(pattern, "");
  });

  // Tighten: remove double spaces
  polished = polished.replace(/\s{2,}/g, " ");

  // Tighten: remove empty lines
  polished = polished.replace(/\n\s*\n/g, "\n");

  // Trim
  polished = polished.trim();

  return polished;
}

function polishContent(content) {
  if (!content) return content;
  if (typeof content === "string") return polishText(content);
  if (Array.isArray(content)) return content.map(function(item) {
    return typeof item === "string" ? polishText(item) : item;
  });
  return content;
}

// ── 6. MAIN ORCHESTRATION ────────────────────────────────

/**
 * Full proposal orchestration pipeline.
 * Returns the complete plan: dynamic slides + canonical slides + strategic angle.
 */
function orchestrateProposal(inputs) {
  // Step 1: Interpret intake
  var intake = interpretIntake(inputs);

  // Step 2: Generate strategic angle
  var angle = generateStrategicAngle(intake);

  // Step 3: Plan dynamic (CLASS A) slides
  var dynamicSlides = planDynamicSlides(intake, angle);

  // Step 4: Plan canonical (CLASS B) slides
  var canonicalSlides = planCanonicalSlides(intake.archetype);

  // Step 5: Polish the angle text
  angle.thesis = polishText(angle.thesis);
  angle.tension = polishText(angle.tension);
  angle.brincRole = polishText(angle.brincRole);
  angle.whyNow = angle.whyNow.map(function(w) { return polishText(w); });

  return {
    intake: intake,
    angle: angle,
    dynamicSlides: dynamicSlides,
    canonicalSlides: canonicalSlides,
    totalSlides: 1 + dynamicSlides.length + canonicalSlides.length, // +1 for cover
    narrativeFlow: buildNarrativeFlow(dynamicSlides, canonicalSlides),
  };
}

function buildNarrativeFlow(dynamic, canonical) {
  var flow = ["cover"];
  dynamic.forEach(function(s) { flow.push(s.type); });
  canonical.forEach(function(s) { flow.push(s.type); });
  return flow;
}

// ── Exports ───────────────────────────────────────────────

export {
  orchestrateProposal,
  interpretIntake,
  generateStrategicAngle,
  planDynamicSlides,
  planCanonicalSlides,
  polishText,
  polishContent,
};
