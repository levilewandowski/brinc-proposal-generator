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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const logs: string[] = [];

  function gfetch(token: string, url: string, init?: any) {
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    }).then((r) =>
      r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} }))
    );
  }

  let { accessToken, refreshToken, title, prospectName, prospectCompany, offerings, suggestedAngle, includeOverview, includeCaseStudies } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({ ok: false, error: "Missing accessToken", logs });
  }

  // Refresh token if needed
  const checkPromise = refreshToken
    ? gfetch(accessToken, `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
    : Promise.resolve({ ok: true, status: 200, data: {} });

  checkPromise
    .then((check) => {
      if (!check.ok && refreshToken) {
        return fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
          }),
        })
          .then((r) => r.json())
          .then((d: any) => {
            if (d.access_token) accessToken = d.access_token;
          });
      }
    })
    .then(() => {
      // Create presentation
      return gfetch(accessToken, "https://slides.googleapis.com/v1/presentations", {
        method: "POST",
        body: JSON.stringify({ title: title || `${prospectCompany || prospectName || "Partner"} x Brinc` }),
      });
    })
    .then((created) => {
      if (!created.ok) throw new Error(created.data.error?.message || "Create failed");
      const presId: string = created.data.presentationId;
      logs.push(`Created: ${presId}`);

      // Get structure + batchUpdate
      return gfetch(
        accessToken,
        `https://slides.googleapis.com/v1/presentations/${presId}?fields=slides(objectId,pageElements(objectId,shape(placeholder(type))))`
      ).then((state) => {
        const slides: any[] = state.data.slides || [];
        const reqs: any[] = [];
        const now = Date.now();

        // Cover
        if (slides[0]) {
          const els = slides[0].pageElements || [];
          const tb = els.find((e: any) => ["TITLE", "CENTERED_TITLE"].includes(e.shape?.placeholder?.type));
          const sb = els.find((e: any) => e.shape?.placeholder?.type === "SUBTITLE");
          if (tb) reqs.push({ insertText: { objectId: tb.objectId, insertionIndex: 0, text: prospectCompany || prospectName || "Partnership" } });
          if (sb) reqs.push({ insertText: { objectId: sb.objectId, insertionIndex: 0, text: `Prepared by Brinc | ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}` } });
        }

        // Content slides
        const addSlide = (t: string, body: string[]) => {
          const sid = `s${now}_${reqs.length}`;
          const tid = `t${now}_${reqs.length}`;
          const bid = `b${now}_${reqs.length}`;
          reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
          reqs.push({ createShape: { objectId: tid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } } });
          reqs.push({ insertText: { objectId: tid, text: t } });
          reqs.push({ updateTextStyle: { objectId: tid, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.11, green: 0.16, blue: 0.29 } } } } }, fields: "bold,fontSize,foregroundColor" } });
          if (body.length) {
            reqs.push({ createShape: { objectId: bid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" } } } });
            reqs.push({ insertText: { objectId: bid, text: body.join("\n") } });
            reqs.push({ updateTextStyle: { objectId: bid, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } } } }, fields: "fontSize,foregroundColor" } });
          }
        };

        addSlide("Strategic Context", suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."]);
        if (offerings?.length) addSlide("Proposed Collaboration", [`For ${prospectCompany || prospectName || "partner"}:`, ...offerings.map((o: string) => `\u2022 ${o}`)]);
        if (includeOverview) addSlide("About Brinc", ["\u2022 12+ years in accelerator programs", "\u2022 75+ programs, 20+ countries", "\u2022 170+ portfolio companies", "\u2022 $1.69B+ valuation"]);
        if (includeCaseStudies) addSlide("Relevant Experience", ["\u2022 Dubai DET / Hi2 Incubator", "\u2022 EDB Manufacturing Accelerator", "\u2022 MBRIF Innovation Fund", "\u2022 QSTP Partnership"]);
        addSlide("Next Steps", ["1. Finalize scope", "2. Mobilize team", "3. Launch pilot", "4. Full execution", "5. Demo Day"]);

        return gfetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({ requests: reqs }),
        }).then((batch) => {
          if (!batch.ok) throw new Error(batch.data.error?.message || "Batch failed");
          logs.push(`Batch: ${reqs.length} reqs`);

          // Folder move
          let folderPath = "";
          if (DRIVE_ROOT) {
            logs.push(`Root: ${DRIVE_ROOT.substring(0, 10)}...`);
            const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and '${DRIVE_ROOT}' in parents and name='01 Generated Proposals' and trashed=false`);
            return gfetch(accessToken, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)
              .then((search) => {
                const fid = search.data.files?.[0]?.id;
                return fid
                  ? Promise.resolve(fid)
                  : gfetch(accessToken, "https://www.googleapis.com/drive/v3/files", {
                      method: "POST",
                      body: JSON.stringify({ name: "01 Generated Proposals", mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_ROOT] }),
                    }).then((c) => c.data.id);
              })
              .then((folderId) => {
                if (!folderId) { logs.push("No folder"); return presId; }
                logs.push(`Folder: ${folderId}`);
                return gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presId}?addParents=${folderId}&removeParents=root`, { method: "PATCH" })
                  .then(() => gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presId}?fields=parents`))
                  .then((after) => {
                    const inTarget = (after.data.parents || []).includes(folderId);
                    logs.push(`In folder: ${inTarget}`);
                    if (inTarget) folderPath = "01 Generated Proposals";
                    return presId;
                  });
              })
              .then(() => ({
                ok: true, presentationId: presId,
                webViewLink: `https://docs.google.com/presentation/d/${presId}/edit`,
                slideCount: Math.floor(reqs.length / 5) + 1, folderPath, logs,
              }));
          }
          return { ok: true, presentationId: presId, webViewLink: `https://docs.google.com/presentation/d/${presId}/edit`, slideCount: Math.floor(reqs.length / 5) + 1, folderPath: "", logs };
        });
      });
    })
    .then((result: any) => res.status(200).json(result))
    .catch((err: any) => res.status(500).json({ ok: false, error: err.message, logs }));
}
