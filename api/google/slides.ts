import type { VercelRequest, VercelResponse } from "@vercel/node";

interface SlideContent {
  title: string;
  body: string[];
}

/** Drive API helper with response logging */
async function driveFetch<T = any>(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T; status: number }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...((init?.headers as Record<string, string>) || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  console.log(`[Drive] ${init?.method || "GET"} ${url.split("?")[0].split("/").pop()} => HTTP ${res.status}`);
  if (!res.ok) {
    console.error("[Drive] Error response:", JSON.stringify(data).substring(0, 500));
  }
  return { ok: res.ok, data, status: res.status };
}

/** Look up a subfolder by name under the configured root */
async function findFolder(
  accessToken: string,
  rootFolderId: string,
  name: string
): Promise<{ id: string | null; created: boolean; log: string[] }> {
  const log: string[] = [`Looking for '${name}' under root ${rootFolderId.substring(0, 10)}...`];

  // Search
  const search = await driveFetch<{ files?: { id: string; name: string }[] }>(
    accessToken,
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.google-apps.folder' and ` +
          `'${rootFolderId}' in parents and ` +
          `name='${name}' and trashed=false`
      ) +
      "&fields=files(id,name)",
    { headers: { "Content-Type": "application/json" } }
  );

  if (search.data.files && search.data.files.length > 0) {
    log.push(`Found existing: ${search.data.files[0].id}`);
    return { id: search.data.files[0].id, created: false, log };
  }

  // Create
  log.push("Not found, creating...");
  const created = await driveFetch<{ id?: string; error?: any }>(
    accessToken,
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootFolderId],
      }),
    }
  );

  if (created.data.id) {
    log.push(`Created: ${created.data.id}`);
    return { id: created.data.id, created: true, log };
  }

  log.push(`Creation failed: ${JSON.stringify(created.data.error)}`);
  return { id: null, created: false, log };
}

/** Refresh expired access token */
async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

/** Copy template from 03 Templates */
async function copyTemplate(
  accessToken: string
): Promise<{ presentationId: string; title: string } | null> {
  const rootFolder = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  if (!rootFolder) return null;

  // Find 03 Templates folder
  const folder = await findFolder(accessToken, rootFolder, "03 Templates");
  if (!folder.id) return null;

  // Find first PPTX
  const files = await driveFetch<{ files?: { id: string; name: string }[] }>(
    accessToken,
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '${folder.id}' in parents and trashed=false`
      ) +
      "&fields=files(id,name)&pageSize=1"
  );
  if (!files.data.files || files.data.files.length === 0) return null;

  // Copy-convert
  const copied = await driveFetch<{ id?: string; error?: any }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${files.data.files[0].id}/copy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `[TEMP] ${files.data.files[0].name}`,
        mimeType: "application/vnd.google-apps.presentation",
      }),
    }
  );

  return copied.data.id
    ? { presentationId: copied.data.id, title: files.data.files[0].name }
    : null;
}

// ---- MAIN HANDLER ----

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET diagnostic
  if (req.method === "GET") {
    const envFolder = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
    return res.status(200).json({
      ok: true,
      hasDriveFolderId: !!envFolder,
      driveFolderIdLength: envFolder.length,
      driveFolderIdPrefix: envFolder ? envFolder.substring(0, 12) + "..." : null,
      hasClientId: !!(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID),
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const debug: string[] = [];
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  let { accessToken, refreshToken, title, prospectName, prospectCompany, offerings, suggestedAngle, includeOverview, includeCaseStudies } = req.body || {};

  if (!accessToken) return res.status(400).json({ error: "Missing accessToken" });

  const presentationTitle = title || `${prospectCompany || prospectName || "Partner"} x Brinc Proposal`;

  // Refresh if needed
  if (refreshToken) {
    const check = await driveFetch<any>(accessToken, "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken);
    if (!check.ok) {
      const newToken = await refreshAccessToken(refreshToken, clientId, clientSecret);
      if (newToken) accessToken = newToken;
    }
  }

  let presentationId: string;
  let usedTemplate = false;

  try {
    // ---- 1. Create presentation ----
    const template = await copyTemplate(accessToken);
    if (template) {
      usedTemplate = true;
      presentationId = template.presentationId;
      await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${presentationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presentationTitle }),
      });
    } else {
      const created = await fetch("https://slides.googleapis.com/v1/presentations", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: presentationTitle }),
      });
      const presData = (await created.json()) as any;
      if (!created.ok) return res.status(400).json({ error: presData.error?.message || "Create failed" });
      presentationId = presData.presentationId;
    }

    debug.push(`Presentation created: ${presentationId}`);

    // ---- 2. Get slide structure ----
    const stateRes = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=presentationId,title,slides(objectId,pageElements(objectId,shape(placeholder(type))))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const presState = (await stateRes.json()) as any;
    const existingSlides: any[] = presState.slides || [];

    // ---- 3. Build content ----
    const contentSlides: SlideContent[] = [];
    contentSlides.push({
      title: "Strategic Context",
      body: suggestedAngle ? suggestedAngle.split("\n").filter((s: string) => s.trim()) : ["Building on strategic alignment and shared vision."],
    });
    if (offerings?.length > 0) {
      contentSlides.push({ title: "Proposed Collaboration", body: [`Engagement for ${prospectCompany || prospectName || "partner"}:`, ...offerings.map((o: string) => `\u2022 ${o}`)] });
    }
    if (includeOverview) {
      contentSlides.push({ title: "About Brinc", body: ["\u2022 12+ years in accelerator programs", "\u2022 75+ programs across 20+ countries", "\u2022 170+ portfolio companies", "\u2022 $1.69B+ portfolio valuation", "\u2022 Global: MENA, Asia, Europe, Americas"] });
    }
    if (includeCaseStudies) {
      contentSlides.push({ title: "Relevant Experience", body: ["\u2022 Dubai DET / Hi2 Incubator", "\u2022 EDB Manufacturing Accelerator", "\u2022 MBRIF Innovation Fund", "\u2022 QSTP Partnership"] });
    }
    contentSlides.push({ title: "Next Steps", body: ["1. Finalize scope and terms", "2. Mobilize program team", "3. Launch pilot (Weeks 1-4)", "4. Full execution (Months 2-12)", "5. Demo Day and ongoing support"] });

    // ---- 4. BatchUpdate ----
    const requests: any[] = [];
    const now = Date.now();

    // Cover slide
    if (existingSlides.length > 0) {
      const els = existingSlides[0].pageElements || [];
      const titleBox = els.find((e: any) => e.shape?.placeholder?.type === "TITLE" || e.shape?.placeholder?.type === "CENTERED_TITLE");
      const subtitleBox = els.find((e: any) => e.shape?.placeholder?.type === "SUBTITLE");
      if (titleBox) requests.push({ insertText: { objectId: titleBox.objectId, insertionIndex: 0, text: prospectCompany || prospectName || "Partnership Proposal" } });
      if (subtitleBox) requests.push({ insertText: { objectId: subtitleBox.objectId, insertionIndex: 0, text: `Prepared by Brinc | ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}` } });
    }

    // Content slides
    for (let i = 0; i < contentSlides.length; i++) {
      const slideId = `slide_${now}_${i}`;
      const titleBoxId = `title_${now}_${i}`;
      const bodyBoxId = `body_${now}_${i}`;
      const slide = contentSlides[i];

      requests.push({ createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } });
      requests.push({ createShape: { objectId: titleBoxId, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: slideId, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 50, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 40, unit: "PT" } } } });
      requests.push({ insertText: { objectId: titleBoxId, text: slide.title } });
      requests.push({ updateTextStyle: { objectId: titleBoxId, style: { bold: true, fontSize: { magnitude: 28, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.11, green: 0.16, blue: 0.29 } } } } }, fields: "bold,fontSize,foregroundColor" } });

      if (slide.body.length > 0) {
        requests.push({ createShape: { objectId: bodyBoxId, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: slideId, size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } }, transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 100, unit: "PT" } } } });
        requests.push({ insertText: { objectId: bodyBoxId, text: slide.body.join("\n") } });
        requests.push({ updateTextStyle: { objectId: bodyBoxId, style: { fontSize: { magnitude: 14, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } } } }, fields: "fontSize,foregroundColor" } });
      }
    }

    const batchRes = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
    const batchData = (await batchRes.json()) as any;
    if (!batchRes.ok) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${presentationId}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      return res.status(400).json({ error: batchData.error?.message || "Batch failed", details: batchData });
    }

    // ---- 5. HARD VERIFICATION: Check file parents ----
    debug.push("--- Parent Verification ---");

    // Get file metadata before move
    const beforeMove = await driveFetch<{ id: string; name: string; parents?: string[] }>(
      accessToken,
      `https://www.googleapis.com/drive/v3/files/${presentationId}?fields=id,name,parents`
    );
    debug.push(`Before move: parents=[${(beforeMove.data.parents || []).join(", ")}]`);

    // Folder move
    let folderPath = "";
    let targetFolderId: string | null = null;

    if (rootFolderId) {
      const folder = await findFolder(accessToken, rootFolderId, "01 Generated Proposals");
      debug.push(...folder.log);
      targetFolderId = folder.id;

      if (targetFolderId) {
        // Move file
        const moveResult = await driveFetch<{ id?: string; parents?: string[]; error?: any }>(
          accessToken,
          `https://www.googleapis.com/drive/v3/files/${presentationId}?addParents=${targetFolderId}&removeParents=root`,
          { method: "PATCH" }
        );
        debug.push(`Move response: HTTP ${moveResult.status}`);
        if (!moveResult.ok) {
          debug.push(`Move error: ${JSON.stringify(moveResult.data.error)}`);
        }

        // HARD CHECK: verify parents AFTER move
        const afterMove = await driveFetch<{ id: string; name: string; parents?: string[] }>(
          accessToken,
          `https://www.googleapis.com/drive/v3/files/${presentationId}?fields=id,name,parents,mimeType,ownedByMe`
        );
        const finalParents = afterMove.data.parents || [];
        const isInTarget = finalParents.includes(targetFolderId);
        debug.push(`After move: parents=[${finalParents.join(", ")}]`);
        debug.push(`In target folder: ${isInTarget}`);

        if (isInTarget) {
          folderPath = "01 Generated Proposals";
          debug.push("SUCCESS: File is in correct folder");
        } else {
          debug.push("WARNING: File NOT in target folder after move");
        }
      }
    } else {
      debug.push("No GOOGLE_DRIVE_FOLDER_ID set, skipping folder move");
    }

    // ---- 6. Return with full debug ----
    return res.status(200).json({
      presentationId,
      title: presentationTitle,
      webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: contentSlides.length + 1,
      usedTemplate,
      folderPath,
      hasRootFolder: !!rootFolderId,
      targetFolderId,
      debug,
    });
  } catch (err: any) {
    console.error("[Slides] Error:", err);
    return res.status(500).json({ error: err.message, debug });
  }
}
