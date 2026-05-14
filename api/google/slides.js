const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

module.exports = function(req, res) {
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

    // Build content
    var reqs = [];
    var now = Date.now();
    var slideIdx = 0;

    function addSection(sectionTitle, sectionBody) {
      var sid = "s" + now + "_" + slideIdx;
      var tid = "t" + now + "_" + slideIdx;
      var bid = "b" + now + "_" + slideIdx;
      slideIdx++;

      reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
      reqs.push({ createShape: { objectId: tid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } } });
      reqs.push({ insertText: { objectId: tid, text: sectionTitle } });
      reqs.push({ updateTextStyle: { objectId: tid, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.105, green: 0.164, blue: 0.29 } } } } }, fields: "bold,fontSize,foregroundColor" } });

      if (sectionBody.length > 0) {
        reqs.push({ createShape: { objectId: bid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" } } } });
        reqs.push({ insertText: { objectId: bid, text: sectionBody.join("\n") } });
        reqs.push({ updateTextStyle: { objectId: bid, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } } } }, fields: "fontSize,foregroundColor" } });
      }
    }

    // Cover
    addSection("Cover", [prospectCompany || prospectName || "Partnership Proposal"]);
    addSection("Strategic Context", suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."]);

    if (offerings.length > 0) {
      var lines = ["A tailored engagement between " + (prospectCompany || prospectName || "your organization") + " and Brinc:"];
      offerings.forEach(function(o) { lines.push("- " + o); });
      addSection("Proposed Collaboration", lines);
    }

    if (includeOverview) {
      addSection("About Brinc", [
        "- 12+ years in accelerator and innovation programs",
        "- 75+ programs executed across 20+ countries",
        "- 170+ portfolio companies supported",
        "- $1.69B+ total portfolio valuation",
        "- Global: MENA, Asia, Europe, Americas",
      ]);
    }

    if (includeCaseStudies) {
      addSection("Relevant Experience", [
        "- Dubai DET / Hi2 Incubator - 40+ startups, $12M+ raised",
        "- EDB Manufacturing Accelerator - 15 startups, 5 pilots",
        "- MBRIF Innovation Fund - 25 startups, 8 commercialized",
        "- QSTP Partnership - Tech transfer and scouting",
      ]);
    }

    addSection("Next Steps", [
      "1. Finalize scope and commercial terms",
      "2. Mobilize program team and resources",
      "3. Launch pilot phase (Weeks 1-4)",
      "4. Full program execution (Months 2-12)",
      "5. Demo Day and portfolio support (Ongoing)",
    ]);

    // Apply batchUpdate
    return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: reqs }),
    }).then(function(batch) {
      if (!batch.ok) {
        fetch("https://www.googleapis.com/drive/v3/files/" + presId, { method: "DELETE", headers: { Authorization: "Bearer " + accessToken } }).catch(function(){});
        throw new Error(batch.data.error ? batch.data.error.message : "Batch failed");
      }
      logs.push("Batch: " + reqs.length + " reqs");

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
                if (found[0]) { logs.push("Reuse: " + found[0].id); return found[0].id; }
                return gapi(accessToken, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
                  method: "POST",
                  body: JSON.stringify({ name: "01 Generated Proposals", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
                }).then(function(c) { logs.push("Created: " + c.data.id); return c.data.id; });
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
            return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: fp, logs: logs };
          });
      }
      return { ok: true, presentationId: presId, title: title, webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit", slideCount: slideIdx, folderPath: "", logs: logs };
    });
  }).then(function(result) {
    res.end(JSON.stringify(result));
  }).catch(function(err) {
    console.error("[Slides]", err);
    res.status(500).end(JSON.stringify({ ok: false, error: err.message, logs: logs }));
  });
};
