const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.end(JSON.stringify({ ok: true, hasDriveFolder: !!DRIVE_ROOT }));
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  let accessToken = body.accessToken;
  const refreshToken = body.refreshToken;
  const patterns = body.patterns || null;

  if (!accessToken) {
    return res.end(JSON.stringify({ ok: false, error: "Missing accessToken" }));
  }

  const title = body.title || (body.prospectCompany || body.prospectName || "Partner") + " x Brinc";
  const prospectCompany = body.prospectCompany || "";
  const prospectName = body.prospectName || "";
  const offerings = body.offerings || [];
  const suggestedAngle = body.suggestedAngle || "";
  const includeOverview = body.includeOverview;
  const includeCaseStudies = body.includeCaseStudies;

  const logs = [];

  function gapi(token, url, init) {
    return fetch(url, Object.assign({}, init, {
      headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + token, "Content-Type": "application/json" }),
    })).then(function(r) {
      return r.text().then(function(t) { return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} }; });
    });
  }

  // Refresh token
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

  tokenPromise.then(function() {
    // Create presentation
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations", {
      method: "POST",
      body: JSON.stringify({ title: title }),
    });
  }).then(function(created) {
    if (!created.ok) throw new Error(created.data.error ? created.data.error.message : "Create failed");
    var presId = created.data.presentationId;
    logs.push("Created: " + presId);

    // Determine section order from patterns if available
    var sectionOrder = ["cover", "context", "collaboration", "overview", "experience", "next_steps"];
    if (patterns && patterns.inferredSectionOrder) {
      // Map pattern sections to our generation sections
      var mapped = patterns.inferredSectionOrder.map(function(s) {
        if (s === "cover") return "cover";
        if (s === "overview" || s === "track_record") return includeOverview ? "overview" : null;
        if (s === "case_study" || s === "case_studies") return includeCaseStudies ? "experience" : null;
        if (s === "approach" || s === "methodology") return "approach";
        if (s === "next_steps" || s === "timeline") return "next_steps";
        if (s === "objectives" || s === "goals") return "context";
        if (s === "value_proposition") return "value";
        if (s === "team") return includeOverview ? "overview" : null;
        if (s === "deliverables") return "collaboration";
        return "content";
      }).filter(Boolean);

      // Deduplicate
      var seen = {};
      var deduped = [];
      for (var i = 0; i < mapped.length; i++) {
        if (!seen[mapped[i]]) { seen[mapped[i]] = true; deduped.push(mapped[i]); }
      }
      if (deduped.length >= 3) sectionOrder = deduped;
      logs.push("Using learned section order: " + sectionOrder.join(" > "));
    }

    // Build content sections
    var sections = [];
    var contentSamples = patterns && patterns.sectionContentSamples || {};

    // Helper to get sample text for a section
    function getSample(sectionKey, fallback) {
      var samples = contentSamples[sectionKey] || [];
      if (samples.length > 0) return samples[Math.floor(Math.random() * samples.length)];
      return fallback;
    }

    // Generate each section
    for (var si = 0; si < sectionOrder.length; si++) {
      var sec = sectionOrder[si];

      if (sec === "cover") {
        sections.push({
          title: prospectCompany || prospectName || "Partnership Proposal",
          subtitle: "x Brinc",
          type: "cover",
          body: suggestedAngle ? suggestedAngle.split("\n").filter(Boolean).slice(0, 2) : []
        });
      }
      else if (sec === "context") {
        var ctxLines = suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."];
        // If we have content samples for objectives/context, blend them in
        var ctxSample = getSample("objectives", "");
        if (ctxSample && ctxLines.length < 3) ctxLines.push(ctxSample);
        sections.push({ title: "Strategic Context", type: "content", body: ctxLines });
      }
      else if (sec === "collaboration" || sec === "approach") {
        if (offerings.length > 0) {
          var lines = ["A tailored engagement between " + (prospectCompany || prospectName || "your organization") + " and Brinc:"];
          offerings.forEach(function(o) { lines.push("- " + o); });
          // Add deliverables sample if available
          var delSample = getSample("deliverables", "");
          if (delSample) lines.push("\nKey deliverables: " + delSample);
          sections.push({ title: sec === "approach" ? "Our Approach" : "Proposed Collaboration", type: "content", body: lines });
        } else if (sec === "approach") {
          sections.push({
            title: "Our Approach",
            type: "content",
            body: [
              "- Diagnostic: Assess current innovation landscape and gaps",
              "- Design: Co-create program structure with your team",
              "- Execute: Run full program with Brinc's global team",
              "- Scale: Transition to sustainable long-term operation"
            ]
          });
        }
      }
      else if (sec === "value") {
        sections.push({
          title: "Why Brinc",
          type: "content",
          body: [
            "- Tech-enabled platform (VentureVerse) for tracking and analytics",
            "- Global network across MENA, Asia, Europe, Americas",
            "- 12+ years specializing in accelerator and innovation programs",
            "- Data-driven startup selection and portfolio management",
            getSample("value_proposition", "- Proven methodology with measurable outcomes")
          ]
        });
      }
      else if (sec === "overview") {
        if (includeOverview) {
          var overviewBody = [
            "- 12+ years in accelerator and innovation programs",
            "- 75+ programs executed across 20+ countries",
            "- 170+ portfolio companies supported",
            "- $1.69B+ total portfolio valuation",
            "- Global: MENA, Asia, Europe, Americas",
          ];
          var overviewSample = getSample("overview", "");
          if (overviewSample) overviewBody.push("- " + overviewSample);
          sections.push({ title: "About Brinc", type: "content", body: overviewBody });

          // Add track record slide if patterns suggest it
          if (contentSamples["track_record"] && contentSamples["track_record"].length > 0) {
            sections.push({ title: "Track Record", type: "content", body: contentSamples["track_record"].slice(0, 4) });
          }
        }
      }
      else if (sec === "experience") {
        if (includeCaseStudies) {
          var caseBody = [
            "- Dubai DET / Hi2 Incubator - 40+ startups, $12M+ raised",
            "- EDB Manufacturing Accelerator - 15 startups, 5 pilots",
            "- MBRIF Innovation Fund - 25 startups, 8 commercialized",
            "- QSTP Partnership - Tech transfer and scouting",
          ];
          var caseSample = getSample("case_study", "");
          if (caseSample) caseBody.push("- " + caseSample);
          sections.push({ title: "Relevant Experience", type: "content", body: caseBody });
        }
      }
      else if (sec === "next_steps") {
        sections.push({
          title: "Next Steps",
          type: "content",
          body: [
            "1. Finalize scope and commercial terms",
            "2. Mobilize program team and resources",
            "3. Launch pilot phase (Weeks 1-4)",
            "4. Full program execution (Months 2-12)",
            "5. Demo Day and portfolio support (Ongoing)",
          ]
        });
      }
      else if (sec === "content") {
        sections.push({
          title: "Key Considerations",
          type: "content",
          body: suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Exploring partnership opportunities."]
        });
      }
    }

    // Build batchUpdate requests
    var now = Date.now();
    var slideIdx = 0;

    // Color palette - Brinc navy
    var COLORS = {
      navy: { red: 0.105, green: 0.164, blue: 0.29 },
      white: { red: 1, green: 1, blue: 1 },
      gray: { red: 0.33, green: 0.33, blue: 0.33 },
      lightGray: { red: 0.55, green: 0.55, blue: 0.55 },
      accent: { red: 0.2, green: 0.4, blue: 0.7 },
    };

    function buildSlideRequests(section) {
      var sid = "s" + now + "_" + slideIdx;
      slideIdx++;
      var r = [];

      if (section.type === "cover") {
        // Create slide FIRST (must be first request for this slide)
        r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });

        // Full-bleed cover with navy background shape
        var bgId = "bg" + sid;
        r.push({ createShape: {
          objectId: bgId, shapeType: "RECTANGLE",
          elementProperties: { pageObjectId: sid, size: { width: { magnitude: 720, unit: "PT" }, height: { magnitude: 540, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: "PT" } } }
        });
        r.push({ updateShapeProperties: { objectId: bgId, shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: COLORS.navy } } } }, fields: "shapeBackgroundFill.solidFill.color" } });

        // Title
        var tid = "t" + sid;
        r.push({ createShape: {
          objectId: tid, shapeType: "TEXT_BOX",
          elementProperties: { pageObjectId: sid, size: { width: { magnitude: 600, unit: "PT" }, height: { magnitude: 80, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 60, translateY: 180, unit: "PT" } } }
        });
        r.push({ insertText: { objectId: tid, text: section.title } });
        r.push({ updateTextStyle: { objectId: tid, style: { bold: true, fontSize: { magnitude: 44, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.white } } }, fields: "bold,fontSize,foregroundColor" } });

        // Subtitle
        if (section.subtitle) {
          var sid2 = "st" + sid;
          r.push({ createShape: {
            objectId: sid2, shapeType: "TEXT_BOX",
            elementProperties: { pageObjectId: sid, size: { width: { magnitude: 400, unit: "PT" }, height: { magnitude: 40, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 60, translateY: 270, unit: "PT" } } }
          });
          r.push({ insertText: { objectId: sid2, text: section.subtitle } });
          r.push({ updateTextStyle: { objectId: sid2, style: { fontSize: { magnitude: 24, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.lightGray } } }, fields: "fontSize,foregroundColor" } });
        }

        // Context lines below subtitle
        if (section.body && section.body.length > 0) {
          var cid = "c" + sid;
          r.push({ createShape: {
            objectId: cid, shapeType: "TEXT_BOX",
            elementProperties: { pageObjectId: sid, size: { width: { magnitude: 600, unit: "PT" }, height: { magnitude: 60, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 60, translateY: 330, unit: "PT" } } }
          });
          r.push({ insertText: { objectId: cid, text: section.body.join("\n") } });
          r.push({ updateTextStyle: { objectId: cid, style: { fontSize: { magnitude: 12, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.lightGray } } }, fields: "fontSize,foregroundColor" } });
        }
      }
      else if (section.type === "content") {
        // Standard content slide with heading + body
        r.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });

        // Section title
        var htid = "ht" + sid;
        r.push({ createShape: {
          objectId: htid, shapeType: "TEXT_BOX",
          elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } }
        });
        r.push({ insertText: { objectId: htid, text: section.title } });
        r.push({ updateTextStyle: { objectId: htid, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.navy } } }, fields: "bold,fontSize,foregroundColor" } });

        // Accent bar under title
        var barId = "bar" + sid;
        r.push({ createShape: {
          objectId: barId, shapeType: "RECTANGLE",
          elementProperties: { pageObjectId: sid, size: { width: { magnitude: 80, unit: "PT" }, height: { magnitude: 4, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 90, unit: "PT" } } }
        });
        r.push({ updateShapeProperties: { objectId: barId, shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: COLORS.accent } } } }, fields: "shapeBackgroundFill.solidFill.color" } });

        // Body text
        if (section.body.length > 0) {
          var bid = "b" + sid;
          var bodyText = section.body.join("\n");
          var bodyHeight = Math.min(300, Math.max(100, bodyText.split("\n").length * 24));
          r.push({ createShape: {
            objectId: bid, shapeType: "TEXT_BOX",
            elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: bodyHeight, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 110, unit: "PT" } } }
          });
          r.push({ insertText: { objectId: bid, text: bodyText } });
          r.push({ updateTextStyle: { objectId: bid, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: COLORS.gray } } }, fields: "fontSize,foregroundColor" } });
        }
      }
      return r;
    }

    // Build all requests in correct order
    var orderedReqs = [];
    for (var i = 0; i < sections.length; i++) {
      orderedReqs = orderedReqs.concat(buildSlideRequests(sections[i]));
    }

    logs.push("Sections: " + sections.length + ", requests: " + orderedReqs.length);
    logs.push("Section flow: " + sections.map(function(s) { return s.title; }).join(" > "));

    // Apply batchUpdate
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: orderedReqs }),
    }).then(function(batch) {
      if (!batch.ok) {
        fetch("https://www.googleapis.com/drive/v3/files/" + presId, { method: "DELETE", headers: { Authorization: "Bearer " + accessToken } }).catch(function(){});
        throw new Error(batch.data.error ? batch.data.error.message : "Batch failed");
      }
      logs.push("Batch: " + orderedReqs.length + " reqs applied");

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
              })
              .then(function(fp) {
                return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: fp, logs: logs, sectionFlow: sections.map(function(s) { return s.title; }) };
              });
          });
      }
      return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: "", logs: logs, sectionFlow: sections.map(function(s) { return s.title; }) };
    });
  }).then(function(result) {
    res.end(JSON.stringify(result));
  }).catch(function(err) {
    console.error("[Slides]", err);
    res.status(500).end(JSON.stringify({ ok: false, error: err.message, logs: logs }));
  });
};
