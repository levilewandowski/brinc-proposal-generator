const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function gapi(token: string, url: string, init?: any) {
  return fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init?.headers || {}) },
  }).then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} })));
}

function findFolder(token: string, name: string) {
  if (!DRIVE_ROOT) return Promise.resolve(null);
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='" + name + "' and trashed=false");
  return gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
    .then((r) => r.data.files?.[0]?.id || null);
}

function listPptx(token: string, folderId: string) {
  const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + folderId + "' in parents and trashed=false");
  return gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
    .then((r) => r.data.files || []);
}

function extractIndex(token: string, files: any[], logs: string[]) {
  const sections: Record<string, any[]> = {};
  const layouts: Record<string, Record<string, number>> = {};
  const toProcess = files.slice(0, 3);
  let chain = Promise.resolve();

  for (const file of toProcess) {
    chain = chain.then(() =>
      gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
        method: "POST",
        body: JSON.stringify({ name: "[IDX] " + file.name, mimeType: "application/vnd.google-apps.presentation" }),
      }).then((copied) => {
        if (!copied.data.id) return;
        const tempId = copied.data.id;
        return gapi(token, "https://slides.googleapis.com/v1/presentations/" + tempId + "?fields=slides(objectId,slideProperties(layout(objectId)),pageElements(shape(placeholder(type),text(textElements(content,textRun(content))))))")
          .then((pres) => {
            const slides: any[] = pres.data.slides || [];
            logs.push(file.name + ": " + slides.length + " slides");
            for (let idx = 0; idx < slides.length; idx++) {
              const slide = slides[idx];
              const texts: string[] = [];
              for (const el of slide.pageElements || []) {
                if (el.shape?.text?.textElements) {
                  for (const te of el.shape.text.textElements) {
                    const txt = te.textRun?.content?.trim();
                    if (txt) texts.push(txt);
                  }
                }
              }
              if (texts.length === 0) continue;
              const fullText = texts.join(" ").toLowerCase();
              const layoutId = slide.slideProperties?.layout?.objectId || "";
              const layoutType = layoutId.includes("BLANK") ? "BLANK" : layoutId.includes("SECTION") ? "SECTION" : layoutId.includes("TITLE") ? "TITLE" : "CONTENT";

              let cat = "content";
              const patterns: Record<string, string[]> = {
                cover: ["brinc", "proposal", "partnership"],
                overview: ["about brinc", "who we are", "overview"],
                team: ["team", "leadership"],
                case_study: ["case study", "portfolio", "experience", "det", "hi2"],
                approach: ["approach", "methodology", "process"],
                next_steps: ["next step", "action", "get started"],
                objectives: ["objective", "goals", "scope"],
              };
              for (const [c, keywords] of Object.entries(patterns)) {
                if (keywords.some((k) => fullText.includes(k))) { cat = c; break; }
              }

              if (!sections[cat]) sections[cat] = [];
              sections[cat].push({ title: texts[0], body: texts.slice(1), sourceDeck: file.name, slideIndex: idx });
              if (!layouts[cat]) layouts[cat] = {};
              layouts[cat][layoutType] = (layouts[cat][layoutType] || 0) + 1;
            }
          })
          .finally(() => {
            fetch("https://www.googleapis.com/drive/v3/files/" + tempId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
          });
      }).catch((err: any) => { logs.push("ERR " + file.name + ": " + err.message); })
    );
  }

  return chain.then(() => ({ sections, layoutPreferences: layouts }));
}

function getBestLayout(prefs: Record<string, Record<string, number>>, cat: string) {
  const p = prefs[cat];
  if (!p) return "BLANK";
  const sorted = Object.entries(p).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "BLANK";
}

function moveToFolder(token: string, presId: string, logs: string[]) {
  if (!DRIVE_ROOT) return Promise.resolve("");
  return gapi(token, "https://www.googleapis.com/drive/v3/files/" + presId + "?fields=parents&supportsAllDrives=true")
    .then((before) => {
      const currentParents = before.data.parents || ["root"];
      const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='01 Generated Proposals' and trashed=false");
      return gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,createdTime)&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
        .then((search) => {
          const found = search.data.files || [];
          if (found[0]) { logs.push("Reuse folder: " + found[0].id); return found[0].id; }
          return gapi(token, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
            method: "POST",
            body: JSON.stringify({ name: "01 Generated Proposals", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
          }).then((c) => { logs.push("Created folder: " + c.data.id); return c.data.id; });
        })
        .then((folderId) => {
          if (!folderId) return "";
          return gapi(token, "https://www.googleapis.com/drive/v3/files/" + presId + "?addParents=" + folderId + "&removeParents=" + currentParents.join(",") + "&supportsAllDrives=true&fields=id,parents", { method: "PATCH" })
            .then((moved) => {
              logs.push("Move: HTTP " + moved.status);
              return (moved.data.parents || []).includes(folderId) ? "01 Generated Proposals" : "";
            });
        });
    });
}

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET") return res.status(200).json({ ok: true, hasDriveFolder: !!DRIVE_ROOT });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  let accessToken = body.accessToken;
  const refreshToken = body.refreshToken;
  const useLibrary = body.useLibrary !== false;

  if (!accessToken) return res.status(400).json({ ok: false, error: "Missing accessToken" });

  const title = body.title || (body.prospectCompany || body.prospectName || "Partner") + " x Brinc";
  const prospectCompany = body.prospectCompany || "";
  const prospectName = body.prospectName || "";
  const offerings: string[] = body.offerings || [];
  const suggestedAngle = body.suggestedAngle || "";
  const includeOverview = body.includeOverview;
  const includeCaseStudies = body.includeCaseStudies;

  const logs: string[] = [];
  const libLogs: string[] = [];

  // Refresh token
  const refreshPromise = refreshToken
    ? gapi(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken).then((check) => {
        if (!check.ok) {
          return fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
          }).then((r) => r.json()).then((d: any) => { if (d.access_token) accessToken = d.access_token; });
        }
      })
    : Promise.resolve();

  // Build library index
  const libraryPromise = useLibrary
    ? refreshPromise.then(() =>
        Promise.all([findFolder(accessToken, "02 Source Decks"), findFolder(accessToken, "03 Templates")])
          .then(([sourceId, tmplId]) => {
            const lists: Promise<any>[] = [];
            if (sourceId) lists.push(listPptx(accessToken, sourceId));
            if (tmplId) lists.push(listPptx(accessToken, tmplId));
            return Promise.all(lists);
          })
          .then((results) => {
            const allFiles: { folder: string; id: string; name: string }[] = [];
            results.forEach((files, idx) => {
              const folder = idx === 0 ? "02 Source Decks" : "03 Templates";
              files.forEach((f: any) => allFiles.push({ folder, id: f.id, name: f.name }));
            });
            libLogs.push("Scanning " + allFiles.length + " files");
            return extractIndex(accessToken, allFiles, libLogs);
          })
      )
    : Promise.resolve({ sections: {}, layoutPreferences: {} });

  Promise.all([refreshPromise, libraryPromise])
    .then(([_, { sections, layoutPreferences }]) => {
      // 1. Create from template or blank
      return findFolder(accessToken, "03 Templates").then((tmplFolder) => {
        if (!tmplFolder) return null;
        const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplFolder + "' in parents and trashed=false");
        return gapi(accessToken, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
          .then((r) => r.data.files?.[0]);
      }).then((templateFile) => {
        if (templateFile) {
          logs.push("Template: " + templateFile.name);
          return gapi(accessToken, "https://www.googleapis.com/drive/v3/files/" + templateFile.id + "/copy", {
            method: "POST",
            body: JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.presentation" }),
          }).then((copied) => ({ presId: copied.data.id, usedTemplate: true }));
        }
        return gapi(accessToken, "https://slides.googleapis.com/v1/presentations", {
          method: "POST",
          body: JSON.stringify({ title }),
        }).then((created) => ({ presId: created.data.presentationId, usedTemplate: false }));
      }).then(({ presId, usedTemplate }) => {
        logs.push("Pres: " + presId);

        // 2. Get structure
        return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + "?fields=slides(objectId,pageElements(objectId,shape(placeholder(type))))")
          .then((state) => {
            const slides: any[] = state.data.slides || [];
            const reqs: any[] = [];
            const now = Date.now();
            let slideIdx = 0;

            function addSection(sectionTitle: string, sectionBody: string[], category: string) {
              const sid = "s" + now + "_" + slideIdx;
              const tid = "t" + now + "_" + slideIdx;
              const bid = "b" + now + "_" + slideIdx;
              slideIdx++;

              const layoutHint = getBestLayout(layoutPreferences, category);
              const layoutRef = layoutHint === "TITLE" ? "TITLE_ONLY" : layoutHint === "SECTION" ? "SECTION_HEADER" : "BLANK";

              reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: layoutRef } } });
              reqs.push({ createShape: { objectId: tid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } } });
              reqs.push({ insertText: { objectId: tid, text: sectionTitle } });
              reqs.push({ updateTextStyle: { objectId: tid, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.11, green: 0.16, blue: 0.29 } } } } }, fields: "bold,fontSize,foregroundColor" } });
              if (sectionBody.length > 0) {
                reqs.push({ createShape: { objectId: bid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" } } } });
                reqs.push({ insertText: { objectId: bid, text: sectionBody.join("\n") } });
                reqs.push({ updateTextStyle: { objectId: bid, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } } } }, fields: "fontSize,foregroundColor" } });
              }
            }

            // Cover
            if (slides[0]) {
              const els = slides[0].pageElements || [];
              const tb = els.find((e: any) => ["TITLE", "CENTERED_TITLE"].includes(e.shape?.placeholder?.type));
              const sb = els.find((e: any) => e.shape?.placeholder?.type === "SUBTITLE");
              if (tb) reqs.push({ insertText: { objectId: tb.objectId, insertionIndex: 0, text: prospectCompany || prospectName || "Partnership" } });
              if (sb) reqs.push({ insertText: { objectId: sb.objectId, insertionIndex: 0, text: "Prepared by Brinc | " + new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }) } });
            }

            // Content sections
            addSection("Strategic Context", suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."], "content");
            if (offerings.length > 0) {
              const lines = ["A tailored engagement between " + (prospectCompany || prospectName || "your organization") + " and Brinc:"];
              offerings.forEach((o) => lines.push("- " + o));
              addSection("Proposed Collaboration", lines, "objectives");
            }
            if (includeOverview) {
              addSection("About Brinc", [
                "- 12+ years in accelerator and innovation programs",
                "- 75+ programs executed across 20+ countries",
                "- 170+ portfolio companies supported",
                "- $1.69B+ total portfolio valuation",
                "- Global: MENA, Asia, Europe, Americas",
              ], "overview");
            }
            if (includeCaseStudies) {
              addSection("Relevant Experience", [
                "- Dubai DET / Hi2 Incubator - 40+ startups, $12M+ raised",
                "- EDB Manufacturing Accelerator - 15 startups, 5 pilots",
                "- MBRIF Innovation Fund - 25 startups, 8 commercialized",
                "- QSTP Partnership - Tech transfer and scouting",
              ], "case_study");
            }
            addSection("Next Steps", [
              "1. Finalize scope and commercial terms",
              "2. Mobilize program team and resources",
              "3. Launch pilot phase (Weeks 1-4)",
              "4. Full program execution (Months 2-12)",
              "5. Demo Day and portfolio support (Ongoing)",
            ], "next_steps");

            // 3. Batch update
            return gapi(accessToken, "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate", {
              method: "POST",
              body: JSON.stringify({ requests: reqs }),
            }).then((batch) => {
              if (!batch.ok) {
                fetch("https://www.googleapis.com/drive/v3/files/" + presId, { method: "DELETE", headers: { Authorization: "Bearer " + accessToken } }).catch(() => {});
                throw new Error(batch.data.error?.message || "Batch failed");
              }
              logs.push("Batch: " + reqs.length + " reqs");

              return moveToFolder(accessToken, presId, logs).then((folderPath) => ({
                ok: true, presentationId: presId, title,
                webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit",
                slideCount: slideIdx + 1, usedTemplate, folderPath,
                library: useLibrary ? { scannedSections: Object.keys(sections), layoutPrefs: layoutPreferences } : null,
                libLogs, logs,
              }));
            });
          });
      });
    })
    .then((result: any) => res.status(200).json(result))
    .catch((err: any) => { console.error("[Slides]", err); res.status(500).json({ ok: false, error: err.message, libLogs, logs }); });
}
