// ═══════════════════════════════════════════════════════════
//  BRINC SLIDE RETRIEVAL ENGINE
//  Searches historical slide corpus, ranks candidates,
//  returns best-fit slides for each section.
// ═══════════════════════════════════════════════════════════

import {
  DECK_ARCHETYPES,
  SLIDE_TYPES,
  classifySlide,
  classifyDeck
} from "./archetypes.js";

const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const INDEX_FOLDER_NAME = "06 Indexes";
const INDEX_FILE_NAME = "slide_index.json";

// ── Retrieval Scoring ─────────────────────────────────────

/**
 * Score a candidate slide against the query context.
 * Returns score 0-100. Threshold for retrieval: >= 55.
 */
function scoreCandidate(candidate, query) {
  var score = 0;
  var maxScore = 0;

  // 1. Slide type match (weight: 25) — exact match is critical
  if (candidate.slideType === query.slideType) {
    score += 25;
  } else if (candidate.sectionTag && candidate.sectionTag === query.slideType) {
    score += 20;
  }
  maxScore += 25;

  // 2. Archetype match (weight: 20)
  if (candidate.archetype === query.archetype) {
    score += 20;
  } else if (candidate.archetype && DECK_ARCHETYPES[candidate.archetype] && DECK_ARCHETYPES[query.archetype]) {
    // Partial: check if archetypes share section orders
    var a1 = DECK_ARCHETYPES[candidate.archetype];
    var a2 = DECK_ARCHETYPES[query.archetype];
    var shared = a1.sectionOrder.filter(function(s) { return a2.sectionOrder.indexOf(s) >= 0; });
    score += Math.floor(15 * shared.length / Math.max(a1.sectionOrder.length, a2.sectionOrder.length));
  }
  maxScore += 20;

  // 3. Keyword overlap (weight: 20)
  if (query.keywords && query.keywords.length > 0 && candidate.text) {
    var candidateText = candidate.text.toLowerCase();
    var matches = 0;
    query.keywords.forEach(function(kw) {
      if (candidateText.includes(kw.toLowerCase())) matches++;
    });
    score += Math.floor(20 * matches / query.keywords.length);
  }
  maxScore += 20;

  // 4. Geography relevance (weight: 15)
  if (query.geography && candidate.text) {
    var geo = query.geography.toLowerCase();
    var geoSignals = {
      "uae": ["uae", "dubai", "abu dhabi", "emirates"],
      "gcc": ["gcc", "saudi", "ksa", "bahrain", "oman", "kuwait", "qatar"],
      "global": ["global", "international", "worldwide"]
    };
    var signals = geoSignals[geo] || [geo];
    var geoMatch = signals.some(function(s) { return candidate.text.toLowerCase().includes(s); });
    if (geoMatch) score += 15;
  }
  maxScore += 15;

  // 5. Offering relevance (weight: 15)
  if (query.offerings && query.offerings.length > 0 && candidate.text) {
    var cText = candidate.text.toLowerCase();
    var offMatches = 0;
    query.offerings.forEach(function(off) {
      var offWords = off.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; });
      offWords.forEach(function(w) { if (cText.includes(w)) offMatches++; });
    });
    score += Math.min(15, Math.floor(15 * offMatches / query.offerings.length));
  }
  maxScore += 15;

  // 6. Recency bonus (weight: 5)
  if (candidate.modifiedTime) {
    var age = Date.now() - new Date(candidate.modifiedTime).getTime();
    var ageMonths = age / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths < 3) score += 5;
    else if (ageMonths < 6) score += 3;
    else if (ageMonths < 12) score += 1;
  }
  maxScore += 5;

  // Normalize to 0-100
  var normalized = maxScore > 0 ? Math.floor(score * 100 / maxScore) : 0;
  return normalized;
}

/**
 * Search the slide index for the best matching slide.
 * Returns top N candidates ranked by score.
 */
function retrieveSlides(slideIndex, query, topN) {
  topN = topN || 3;

  if (!slideIndex || !slideIndex.slides || slideIndex.slides.length === 0) {
    return { candidates: [], hasIndex: false };
  }

  var scored = slideIndex.slides.map(function(slide) {
    return {
      ...slide,
      score: scoreCandidate(slide, query)
    };
  });

  // Filter minimum threshold and sort
  scored = scored
    .filter(function(s) { return s.score >= 40; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, topN);

  return {
    hasIndex: true,
    candidates: scored.map(function(s) { return {
      score: s.score,
      slideType: s.slideType,
      archetype: s.archetype,
      text: s.text ? s.text.substring(0, 200) : "",
      sourceDeck: s.sourceDeck,
      sourceSlideId: s.sourceSlideId,
      sourcePresentationId: s.sourcePresentationId,
      modifiedTime: s.modifiedTime,
    }; })
  };
}

/**
 * For each section in a proposal, retrieve the best candidate slide.
 * Returns a plan: which sections are retrieved vs generated.
 */
function buildAssemblyPlan(slideIndex, archetype, offerings, geography, prospectCompany) {
  var arch = DECK_ARCHETYPES[archetype] || DECK_ARCHETYPES.accelerator;
  var plan = [];

  arch.sectionOrder.forEach(function(sectionType) {
    var st = SLIDE_TYPES[sectionType];
    if (!st) return;

    // Build query for this section
    var query = {
      slideType: sectionType,
      archetype: archetype,
      keywords: st.signals || [],
      geography: geography,
      offerings: offerings,
    };

    var result = retrieveSlides(slideIndex, query, 3);

    if (result.hasIndex && result.candidates.length > 0 && result.candidates[0].score >= 55) {
      // Strong retrieval match — adapt from historical slide
      var best = result.candidates[0];
      plan.push({
        type: sectionType,
        label: st.label,
        source: "retrieved",
        score: best.score,
        candidate: best,
        fallbackContent: null,
      });
    } else if (result.hasIndex && result.candidates.length > 0) {
      // Weak match — use as content inspiration but generate fresh
      plan.push({
        type: sectionType,
        label: st.label,
        source: "inspired",
        score: result.candidates[0].score,
        candidate: result.candidates[0],
        fallbackContent: null,
      });
    } else {
      // No match — generate from scratch
      plan.push({
        type: sectionType,
        label: st.label,
        source: "generated",
        score: 0,
        candidate: null,
        fallbackContent: null,
      });
    }
  });

  return plan;
}

/**
 * Adapt retrieved slide content for a new proposal.
 * Rewrites titles, swaps company names, updates dates.
 */
function adaptRetrievedContent(originalText, prospectCompany, offerings, geography) {
  if (!originalText) return "";

  var adapted = originalText;
  var co = prospectCompany || "Partner";
  var geo = geography || "the region";

  // Replace common partner name patterns
  var partnerPatterns = [
    /(?:for|with|to)\s+([A-Z][A-Za-z\s&]+?)(?:\s+(?:to|in|through|via|and|x|×))/g,
    /(?:Client|Partner|Customer)\s*:\s*([A-Z][A-Za-z\s&]+)/g,
  ];

  // Generic replacements
  adapted = adapted.replace(/\b(?:Client|Partner|Customer|Prospect)\b/g, co);
  adapted = adapted.replace(/\[CLIENT\]/g, co);
  adapted = adapted.replace(/\[PARTNER\]/g, co);

  // Replace geography
  adapted = adapted.replace(/\bUAE\b/g, geo === "uae" || geo === "UAE" ? "UAE" : geo);
  adapted = adapted.replace(/\bDubai\b/gi, geo === "uae" || geo === "UAE" ? "Dubai" : geo);

  // Update year references to current year
  var currentYear = new Date().getFullYear();
  adapted = adapted.replace(/\b20[0-2][0-9]\b/g, function(match) {
    var year = parseInt(match);
    if (year < currentYear - 2) return String(currentYear);
    return match;
  });

  return adapted;
}

// ── Index Management ──────────────────────────────────────

/**
 * Build a slide index from library scan results.
 * Returns the index object.
 */
function buildSlideIndex(scanResult) {
  var slides = [];

  if (!scanResult.deckProfiles) return { slides: [], decks: [], builtAt: new Date().toISOString() };

  scanResult.deckProfiles.forEach(function(deck) {
    if (!deck.slides) return;
    deck.slides.forEach(function(slide) {
      slides.push({
        slideType: slide.slideType,
        sectionTag: slide.sectionTag || slide.slideType,
        archetype: deck.archetype,
        text: slide.text || "",
        sourceDeck: deck.fileName,
        sourceFolder: deck.folder,
        sourcePresentationId: deck.presentationId || "",
        sourceSlideId: slide.slideId || "",
        modifiedTime: deck.modifiedTime,
        layout: slide.layout,
        confidence: slide.confidence || 0.5,
      });
    });
  });

  return {
    slides: slides,
    decks: scanResult.deckProfiles.map(function(d) { return { name: d.fileName, archetype: d.archetype }; }),
    archetypeBreakdown: scanResult.archetypeBreakdown || {},
    builtAt: new Date().toISOString(),
  };
}

/**
 * Save slide index to Google Drive as JSON.
 */
function saveIndexToDrive(token, rootId, index, logs) {
  return getOrCreateIndexFolder(token, rootId).then(function(folderId) {
    // Search for existing index file
    var q = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='" + INDEX_FILE_NAME + "' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search) {
      var existingId = search.files && search.files[0] ? search.files[0].id : null;
      var body = JSON.stringify(index, null, 2);

      if (existingId) {
        // Update existing
        return fetch("https://www.googleapis.com/upload/drive/v3/files/" + existingId + "?uploadType=media&supportsAllDrives=true", {
          method: "PATCH",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: body,
        }).then(function() {
          logs.push("Updated slide index: " + existingId);
          return existingId;
        });
      } else {
        // Create new
        var metadata = { name: INDEX_FILE_NAME, mimeType: "application/json", parents: [folderId] };
        var form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", new Blob([body], { type: "application/json" }));

        return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: form,
        }).then(function(r) { return r.json(); }).then(function(file) {
          logs.push("Created slide index: " + file.id);
          return file.id;
        });
      }
    });
  });
}

/**
 * Load slide index from Google Drive.
 */
function loadIndexFromDrive(token, rootId, logs) {
  return getOrCreateIndexFolder(token, rootId).then(function(folderId) {
    var q = encodeURIComponent("mimeType='application/json' and '" + folderId + "' in parents and name='" + INDEX_FILE_NAME + "' and trashed=false");
    return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    }).then(function(r) { return r.json(); }).then(function(search) {
      if (!search.files || search.files.length === 0) {
        logs.push("No slide index found — will generate synthetically");
        return null;
      }
      var fileId = search.files[0].id;
      return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&supportsAllDrives=true", {
        headers: { Authorization: "Bearer " + token }
      }).then(function(r) { return r.json(); }).then(function(index) {
        logs.push("Loaded slide index: " + index.slides.length + " slides from " + (index.decks || []).length + " decks");
        return index;
      });
    });
  }).catch(function(err) {
    logs.push("Error loading index: " + err.message);
    return null;
  });
}

function getOrCreateIndexFolder(token, rootId) {
  rootId = rootId || DRIVE_ROOT;
  // Find 06 Indexes folder under workspace root
  var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + rootId + "' in parents and name='" + INDEX_FOLDER_NAME + "' and trashed=false");
  return fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives", {
    headers: { Authorization: "Bearer " + token }
  }).then(function(r) { return r.json(); }).then(function(search) {
    if (search.files && search.files[0]) return search.files[0].id;
    // Create
    return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: INDEX_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: [rootId] }),
    }).then(function(r) { return r.json(); }).then(function(folder) { return folder.id; });
  });
}

// ── Exports ───────────────────────────────────────────────

export {
  scoreCandidate,
  retrieveSlides,
  buildAssemblyPlan,
  adaptRetrievedContent,
  buildSlideIndex,
  saveIndexToDrive,
  loadIndexFromDrive,
};
