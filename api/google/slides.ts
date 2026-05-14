const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

interface SlideContent { title: string; body: string[]; }

async function gfetch(token: string, url: string, init?: any) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : {} };
}

async function refreshIfNeeded(token: string, refresh?: string): Promise<string> {
  if (!refresh) return token;
  const check = await gfetch(token, `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
  if (check.ok) return token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
  });
  const data = (await res.json()) as any;
  return data.access_token || token;
}

async function getFolder(token: string, root: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and '${root}' in parents and name='${name}' and trashed=false`);
  const search = await gfetch(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  if (search.data.files?.[0]?.id) return search.data.files[0].id;
  const created = await gfetch(token, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [root] }),
  });
  return created.data.id || null;
}

async function copyTemplate(token: string): Promise<string | null> {
  if (!DRIVE_ROOT) return null;
  const folder = await getFolder(token, DRIVE_ROOT, "03 Templates");
  if (!folder) return null;
  const q = encodeURIComponent(`mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '${folder}' in parents and trashed=false`);
  const files = await gfetch(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`);
  if (!files.data.files?.[0]) return null;
  const copied = await gfetch(token, `https://www.googleapis.com/drive/v3/files/${files.data.files[0].id}/copy`, {
    method: "POST",
    body: JSON.stringify({ name: `[TEMP] ${files.data.files[0].name}`, mimeType: "application/vnd.google-apps.presentation" }),
  });
  return copied.data.id || null;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  const logs: string[] = [];

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, hasDriveFolder: !!DRIVE_ROOT, drivePrefix: DRIVE_ROOT ? DRIVE_ROOT.substring(0, 10) : null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let { accessToken, refreshToken, title, prospectName, prospectCompany, offerings, suggestedAngle, includeOverview, includeCaseStudies } = req.body || {};
    if (!accessToken) return res.status(400).json({ ok: false, error: "Missing accessToken", logs });

    accessToken = await refreshIfNeeded(accessToken, refreshToken);
    const presTitle = title || `${prospectCompany || prospectName || "Partner"} x Brinc Proposal`;
    let presId: string;
    let usedTemplate = false;

    // 1. Create or copy template
    const templateId = await copyTemplate(accessToken);
    if (templateId) {
      usedTemplate = true;
      presId = templateId;
      await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presId}`, { method: "PATCH", body: JSON.stringify({ name: presTitle }) });
      logs.push(`Template: ${presId}`);
    } else {
      const created = await gfetch(accessToken, "https://slides.googleapis.com/v1/presentations", { method: "POST", body: JSON.stringify({ title: presTitle }) });
      if (!created.ok) return res.status(400).json({ ok: false, error: created.data.error?.message || "Create failed", logs });
      presId = created.data.presentationId;
      logs.push(`Blank: ${presId}`);
    }

    // 2. Get structure
    const state = await gfetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presId}?fields=presentationId,title,slides(objectId,pageElements(objectId,shape(placeholder(type))))`);
    const slides: any[] = state.data.slides || [];

    // 3. Build content
    const content: SlideContent[] = [];
    content.push({ title: "Strategic Context", body: suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."] });
    if (offerings?.length) content.push({ title: "Proposed Collaboration", body: [`For ${prospectCompany || prospectName || "partner"}:`, ...offerings.map((o: string) => `\u2022 ${o}`)] });
    if (includeOverview) content.push({ title: "About Brinc", body: ["\u2022 12+ years in accelerator programs", "\u2022 75+ programs, 20+ countries", "\u2022 170+ portfolio companies", "\u2022 $1.69B+ valuation", "\u2022 Global: MENA, Asia, Europe, Americas"] });
    if (includeCaseStudies) content.push({ title: "Relevant Experience", body: ["\u2022 Dubai DET / Hi2 Incubator", "\u2022 EDB Manufacturing Accelerator", "\u2022 MBRIF Innovation Fund", "\u2022 QSTP Partnership"] });
    content.push({ title: "Next Steps", body: ["1. Finalize scope and terms", "2. Mobilize team", "3. Launch pilot (Weeks 1-4)", "4. Full execution (Months 2-12)", "5. Demo Day and ongoing support"] });

    // 4. BatchUpdate
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
    for (let i = 0; i < content.length; i++) {
      const s = content[i];
      const sid = `s${now}_${i}`;
      const tid = `t${now}_${i}`;
      const bid = `b${now}_${i}`;

      reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });

      const titleShape = {
        objectId: tid, shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: sid,
          size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" },
        },
      };
      reqs.push({ createShape: titleShape });
      reqs.push({ insertText: { objectId: tid, text: s.title } });
      reqs.push({
        updateTextStyle: {
          objectId: tid,
          style: {
            bold: true,
            fontSize: { magnitude: 28, unit: "PT" },
            foregroundColor: { opaqueColor: { rgbColor: { red: 0.11, green: 0.16, blue: 0.29 } } },
          },
          fields: "bold,fontSize,foregroundColor",
        },
      });

      if (s.body.length) {
        const bodyShape = {
          objectId: bid, shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: sid,
            size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } },
            transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" },
          },
        };
        reqs.push({ createShape: bodyShape });
        reqs.push({ insertText: { objectId: bid, text: s.body.join("\n") } });
        reqs.push({
          updateTextStyle: {
            objectId: bid,
            style: {
              fontSize: { magnitude: 14, unit: "PT" },
              foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } },
            },
            fields: "fontSize,foregroundColor",
          },
        });
      }
    }

    const batch = await gfetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: reqs }) });
    if (!batch.ok) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${presId}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      return res.status(400).json({ ok: false, error: batch.data.error?.message || "Batch failed", logs });
    }
    logs.push(`Batch: ${reqs.length} reqs`);

    // 5. Drive folder move
    let folderPath = "";
    let targetFolder: string | null = null;

    if (DRIVE_ROOT) {
      const before = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presId}?fields=parents`);
      logs.push(`Parents before: ${JSON.stringify(before.data.parents)}`);

      targetFolder = await getFolder(accessToken, DRIVE_ROOT, "01 Generated Proposals");
      logs.push(`Target: ${targetFolder || "MISSING"}`);

      if (targetFolder) {
        const moved = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presId}?addParents=${targetFolder}&removeParents=root`, { method: "PATCH" });
        logs.push(`Move HTTP: ${moved.status}`);

        const after = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presId}?fields=parents`);
        const inTarget = (after.data.parents || []).includes(targetFolder);
        logs.push(`Parents after: ${JSON.stringify(after.data.parents)}`);
        logs.push(`In target: ${inTarget}`);
        folderPath = inTarget ? "01 Generated Proposals" : "";
      }
    } else {
      logs.push("No GOOGLE_DRIVE_FOLDER_ID");
    }

    return res.status(200).json({
      ok: true, presentationId: presId, title: presTitle,
      webViewLink: `https://docs.google.com/presentation/d/${presId}/edit`,
      slideCount: content.length + 1, usedTemplate, folderPath,
      hasRootFolder: !!DRIVE_ROOT, targetFolder, logs,
    });
  } catch (err: any) {
    console.error("[Slides] CRASH:", err);
    return res.status(500).json({ ok: false, error: err.message, logs });
  }
}
