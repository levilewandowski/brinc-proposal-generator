const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasDriveFolder: !!DRIVE_ROOT,
      drivePrefix: DRIVE_ROOT ? DRIVE_ROOT.substring(0, 10) : null,
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { accessToken, refreshToken, title, prospectName, prospectCompany, offerings, suggestedAngle, includeOverview, includeCaseStudies } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: "Missing accessToken" });

  const logs: string[] = [];
  const presTitle = title || `${prospectCompany || prospectName || "Partner"} x Brinc Proposal`;

  // Helper: fetch with auth
  function gfetch(token: string, url: string, init?: any): Promise<{ ok: boolean; status: number; data: any }> {
    return fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    }).then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} })));
  }

  // Step 1: Refresh token if needed
  let token = accessToken;
  const refreshPromise = refreshToken
    ? gfetch(token, `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`).then((check) => {
        if (!check.ok) {
          return fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
          }).then((r) => r.json()).then((d: any) => { if (d.access_token) token = d.access_token; });
        }
      })
    : Promise.resolve();

  refreshPromise.then(() => {
    // Step 2: Create presentation
    return gfetch(token, "https://slides.googleapis.com/v1/presentations", { method: "POST", body: JSON.stringify({ title: presTitle }) });
  }).then((created) => {
    if (!created.ok) throw new Error(created.data.error?.message || "Create failed");
    const presId = created.data.presentationId;
    logs.push(`Created: ${presId}`);

    // Step 3: Get structure
    return gfetch(token, `https://slides.googleapis.com/v1/presentations/${presId}?fields=presentationId,title,slides(objectId,pageElements(objectId,shape(placeholder(type))))`).then((state) => {
      const slides: any[] = state.data.slides || [];

      // Step 4: Build batchUpdate
      const reqs: any[] = [];
      const now = Date.now();

      // Cover
      if (slides[0]) {
        const els = slides[0].pageElements || [];
        const tb = els.find((e: any) => e.shape?.placeholder?.type === "TITLE" || e.shape?.placeholder?.type === "CENTERED_TITLE");
        const sb = els.find((e: any) => e.shape?.placeholder?.type === "SUBTITLE");
        if (tb) reqs.push({ insertText: { objectId: tb.objectId, insertionIndex: 0, text: prospectCompany || prospectName || "Partnership Proposal" } });
        if (sb) reqs.push({ insertText: { objectId: sb.objectId, insertionIndex: 0, text: `Prepared by Brinc | ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}` } });
      }

      // Content slides
      const addSlide = (title: string, body: string[]) => {
        const i = reqs.length;
        const sid = `s${now}_${i}`;
        const tid = `t${now}_${i}`;
        const bid = `b${now}_${i}`;
        reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
        reqs.push({ createShape: { objectId: tid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } } } });
        reqs.push({ insertText: { objectId: tid, text: title } });
        reqs.push({ updateTextStyle: { objectId: tid, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.105, green: 0.164, blue: 0.29 } } } } }, fields: "bold,fontSize,foregroundColor" } });
        if (body.length) {
          reqs.push({ createShape: { objectId: bid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" } } } } });
          reqs.push({ insertText: { objectId: bid, text: body.join("\n") } });
          reqs.push({ updateTextStyle: { objectId: bid, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } } } }, fields: "fontSize,foregroundColor" } });
        }
      };

      addSlide("Strategic Context", suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."]);
      if (offerings?.length) addSlide("Proposed Collaboration", [`For ${prospectCompany || prospectName || "partner"}:`, ...offerings.map((o: string) => `\u2022 ${o}`)]);
      if (includeOverview) addSlide("About Brinc", ["\u2022 12+ years in accelerator programs", "\u2022 75+ programs, 20+ countries", "\u2022 170+ portfolio companies", "\u2022 $1.69B+ valuation", "\u2022 Global: MENA, Asia, Europe, Americas"]);
      if (includeCaseStudies) addSlide("Relevant Experience", ["\u2022 Dubai DET / Hi2 Incubator", "\u2022 EDB Manufacturing Accelerator", "\u2022 MBRIF Innovation Fund", "\u2022 QSTP Partnership"]);
      addSlide("Next Steps", ["1. Finalize scope and terms", "2. Mobilize team", "3. Launch pilot (Weeks 1-4)", "4. Full execution (Months 2-12)", "5. Demo Day and ongoing support"]);

      // Step 5: Apply batchUpdate
      return gfetch(token, `https://slides.googleapis.com/v1/presentations/${presId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: reqs }) }).then((batch) => {
        if (!batch.ok) {
          fetch(`https://www.googleapis.com/drive/v3/files/${presId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
          throw new Error(batch.data.error?.message || "Batch failed");
        }
        logs.push(`Batch: ${reqs.length} reqs`);

        // Step 6: Drive folder move
        let folderPath = "";
        if (DRIVE_ROOT) {
          logs.push(`Drive root: ${DRIVE_ROOT.substring(0, 10)}...`);
          const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and '${DRIVE_ROOT}' in parents and name='01 Generated Proposals' and trashed=false`);
          return gfetch(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`).then((search) => {
            let folderId = search.data.files?.[0]?.id;
            const createFolder = folderId
              ? Promise.resolve(folderId)
              : gfetch(token, "https://www.googleapis.com/drive/v3/files", {
                  method: "POST",
                  body: JSON.stringify({ name: "01 Generated Proposals", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
                }).then((c) => c.data.id);

            return createFolder.then((fid) => {
              if (!fid) { logs.push("Folder creation failed"); return presId; }
              folderId = fid;
              logs.push(`Target: ${folderId}`);
              return gfetch(token, `https://www.googleapis.com/drive/v3/files/${presId}?addParents=${folderId}&removeParents=root`, { method: "PATCH" }).then((move) => {
                logs.push(`Move HTTP: ${move.status}`);
                return gfetch(token, `https://www.googleapis.com/drive/v3/files/${presId}?fields=parents`).then((after) => {
                  const inTarget = (after.data.parents || []).includes(folderId);
                  logs.push(`In target: ${inTarget}`);
                  if (inTarget) folderPath = "01 Generated Proposals";
                  return presId;
                });
              });
            });
          }).then(() => ({
            ok: true, presentationId: presId, title: presTitle,
            webViewLink: `https://docs.google.com/presentation/d/${presId}/edit`,
            slideCount: Math.floor(reqs.length / 5), folderPath, hasRootFolder: true, logs,
          }));
        }
        return { ok: true, presentationId: presId, title: presTitle, webViewLink: `https://docs.google.com/presentation/d/${presId}/edit`, slideCount: Math.floor(reqs.length / 5), folderPath: "", hasRootFolder: false, logs };
      });
    });
  }).then((result) => res.status(200).json(result)).catch((err) => {
    console.error("[Slides]", err);
    res.status(500).json({ ok: false, error: err.message, logs });
  });
}
