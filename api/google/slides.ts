import type { VercelRequest, VercelResponse } from "@vercel/node";

const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

interface SlideContent {
  title: string;
  body: string[];
}

// ---- HELPERS ----

async function gfetch(accessToken: string, url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, data };
}

async function refreshIfNeeded(accessToken: string, refreshToken?: string): Promise<string> {
  if (!refreshToken) return accessToken;
  const check = await gfetch(accessToken, `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
  if (check.ok) return accessToken;
  // Token expired, refresh
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token || accessToken;
}

async function findOrCreateFolder(accessToken: string, rootId: string, name: string): Promise<string | null> {
  // Search
  const search = await gfetch(accessToken,
    "https://www.googleapis.com/drive/v3/files?q=" +
    encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and name='${name}' and trashed=false`) +
    "&fields=files(id)"
  );
  if (search.data.files?.[0]?.id) return search.data.files[0].id;

  // Create
  const created = await gfetch(accessToken, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [rootId] }),
  });
  return created.data.id || null;
}

async function copyTemplate(accessToken: string): Promise<string | null> {
  if (!DRIVE_ROOT) return null;
  const templatesFolder = await findOrCreateFolder(accessToken, DRIVE_ROOT, "03 Templates");
  if (!templatesFolder) return null;

  const files = await gfetch(accessToken,
    "https://www.googleapis.com/drive/v3/files?q=" +
    encodeURIComponent(`mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '${templatesFolder}' in parents and trashed=false`) +
    "&fields=files(id,name)&pageSize=1"
  );
  if (!files.data.files?.[0]) return null;

  const copied = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${files.data.files[0].id}/copy`, {
    method: "POST",
    body: JSON.stringify({ name: `[TEMP] ${files.data.files[0].name}`, mimeType: "application/vnd.google-apps.presentation" }),
  });
  return copied.data.id || null;
}

// ---- HANDLER ----

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");

  // GET diagnostic
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasDriveFolderId: !!DRIVE_ROOT,
      driveFolderIdLength: DRIVE_ROOT.length,
      driveFolderIdPrefix: DRIVE_ROOT ? DRIVE_ROOT.substring(0, 12) + "..." : null,
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const logs: string[] = [];
  try {
    let { accessToken, refreshToken, title, prospectName, prospectCompany, offerings, suggestedAngle, includeOverview, includeCaseStudies } = req.body || {};

    if (!accessToken) return res.status(400).json({ ok: false, error: "Missing accessToken", logs });

    // Refresh token if needed
    accessToken = await refreshIfNeeded(accessToken, refreshToken);

    const presTitle = title || `${prospectCompany || prospectName || "Partner"} x Brinc Proposal`;
    let presentationId: string;
    let usedTemplate = false;

    // 1. Create or copy template
    const templateId = await copyTemplate(accessToken);
    if (templateId) {
      usedTemplate = true;
      presentationId = templateId;
      await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presentationId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: presTitle }),
      });
      logs.push(`Copied template: ${presentationId}`);
    } else {
      const created = await gfetch(accessToken, "https://slides.googleapis.com/v1/presentations", {
        method: "POST",
        body: JSON.stringify({ title: presTitle }),
      });
      if (!created.ok) return res.status(400).json({ ok: false, error: created.data.error?.message || "Create failed", logs });
      presentationId = created.data.presentationId;
      logs.push(`Created blank: ${presentationId}`);
    }

    // 2. Get current slide structure
    const presState = await gfetch(accessToken,
      `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=presentationId,title,slides(objectId,pageElements(objectId,shape(placeholder(type))))`
    );
    const existingSlides: any[] = presState.data.slides || [];

    // 3. Build content
    const contentSlides: SlideContent[] = [];
    contentSlides.push({ title: "Strategic Context", body: suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."] });
    if (offerings?.length) contentSlides.push({ title: "Proposed Collaboration", body: [`For ${prospectCompany || prospectName || "partner"}:`, ...offerings.map((o: string) => `\u2022 ${o}`)] });
    if (includeOverview) contentSlides.push({ title: "About Brinc", body: ["\u2022 12+ years in accelerator programs", "\u2022 75+ programs, 20+ countries", "\u2022 170+ portfolio companies", "\u2022 $1.69B+ valuation", "\u2022 Global: MENA, Asia, Europe, Americas"] });
    if (includeCaseStudies) contentSlides.push({ title: "Relevant Experience", body: ["\u2022 Dubai DET / Hi2 Incubator", "\u2022 EDB Manufacturing Accelerator", "\u2022 MBRIF Innovation Fund", "\u2022 QSTP Partnership"] });
    contentSlides.push({ title: "Next Steps", body: ["1. Finalize scope and terms", "2. Mobilize team", "3. Launch pilot (Weeks 1-4)", "4. Full execution (Months 2-12)", "5. Demo Day and ongoing support"] });

    // 4. BatchUpdate
    const requests: any[] = [];
    const now = Date.now();

    // Cover slide
    if (existingSlides[0]) {
      const els = existingSlides[0].pageElements || [];
      const titleBox = els.find((e: any) => e.shape?.placeholder?.type === "TITLE" || e.shape?.placeholder?.type === "CENTERED_TITLE");
      const subtitleBox = els.find((e: any) => e.shape?.placeholder?.type === "SUBTITLE");
      if (titleBox) requests.push({ insertText: { objectId: titleBox.objectId, insertionIndex: 0, text: prospectCompany || prospectName || "Partnership Proposal" } });
      if (subtitleBox) requests.push({ insertText: { objectId: subtitleBox.objectId, insertionIndex: 0, text: `Prepared by Brinc | ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}` } });
    }

    // Content slides
    for (let i = 0; i < contentSlides.length; i++) {
      const sid = `slide_${now}_${i}`;
      const tid = `title_${now}_${i}`;
      const bid = `body_${now}_${i}`;
      const s = contentSlides[i];

      requests.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: "BLANK" } } });
      requests.push({ createShape: { objectId: tid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } } });
      requests.push({ insertText: { objectId: tid, text: s.title } });
      requests.push({ updateTextStyle: { objectId: tid, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.11, green: 0.16, blue: 0.29 } } } } }, fields: "bold,fontSize,foregroundColor" } });
      if (s.body.length) {
        requests.push({ createShape: { objectId: bid, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: sid, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" } } } });
        requests.push({ insertText: { objectId: bid, text: s.body.join("\n") } });
        requests.push({ updateTextStyle: { objectId: bid, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } } } }, fields: "fontSize,foregroundColor" } });
      }
    }

    const batch = await gfetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
    if (!batch.ok) {
      // Clean up blank presentation
      await fetch(`https://www.googleapis.com/drive/v3/files/${presentationId}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      return res.status(400).json({ ok: false, error: batch.data.error?.message || "Batch failed", details: batch.data, logs });
    }
    logs.push(`BatchUpdate OK: ${requests.length} requests`);

    // 5. DRIVE FOLDER MOVE with full verification
    let folderPath = "";
    let targetFolderId: string | null = null;

    if (DRIVE_ROOT) {
      logs.push(`Drive root configured: ${DRIVE_ROOT.substring(0, 10)}...`);

      // Get current parents
      const before = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presentationId}?fields=parents`);
      logs.push(`Before move parents: ${JSON.stringify(before.data.parents)}`);

      // Find/create target folder
      targetFolderId = await findOrCreateFolder(accessToken, DRIVE_ROOT, "01 Generated Proposals");
      logs.push(`Target folder: ${targetFolderId || "NOT FOUND"}`);

      if (targetFolderId) {
        // Move
        const moved = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presentationId}?addParents=${targetFolderId}&removeParents=root`, { method: "PATCH" });
        logs.push(`Move response: HTTP ${moved.status}, ok=${moved.ok}`);
        if (!moved.ok) logs.push(`Move error: ${JSON.stringify(moved.data.error)}`);

        // Verify
        const after = await gfetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presentationId}?fields=parents,name`);
        const finalParents = after.data.parents || [];
        const inTarget = finalParents.includes(targetFolderId);
        logs.push(`After move parents: ${JSON.stringify(finalParents)}`);
        logs.push(`In target: ${inTarget}`);

        if (inTarget) {
          folderPath = "01 Generated Proposals";
          logs.push("SUCCESS: File in correct folder");
        } else {
          logs.push("WARNING: File NOT in target folder");
        }
      }
    } else {
      logs.push("No GOOGLE_DRIVE_FOLDER_ID, skipping folder move");
    }

    // 6. Return
    return res.status(200).json({
      ok: true,
      presentationId,
      title: presTitle,
      webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: contentSlides.length + 1,
      usedTemplate,
      folderPath,
      hasRootFolder: !!DRIVE_ROOT,
      targetFolderId,
      logs,
    });

  } catch (err: any) {
    console.error("[Slides] CRASH:", err);
    return res.status(500).json({ ok: false, error: err.message || "Server error", stack: err.stack, logs });
  }
}
