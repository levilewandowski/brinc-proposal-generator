import type { VercelRequest, VercelResponse } from "@vercel/node";

const DRIVE_ROOT_FOLDER = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

interface SlideContent {
  title: string;
  body: string[];
}

/** Refresh an expired access token using the refresh token */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
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
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (data.access_token) return data.access_token;
    console.error("[Token Refresh] Failed:", data.error);
    return null;
  } catch (err: any) {
    console.error("[Token Refresh] Error:", err.message);
    return null;
  }
}

/** Look up a subfolder by name under the configured root */
async function getFolderId(accessToken: string, name: string): Promise<string | null> {
  const rootFolder = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  if (!rootFolder) return null;
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.google-apps.folder' and '${rootFolder}' in parents and name='${name}' and trashed=false`
      ) +
      "&fields=files(id)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id || null;
}

/** Find the first PPTX template in "03 Templates" and copy-convert it */
async function copyTemplate(
  accessToken: string
): Promise<{ presentationId: string; title: string } | null> {
  const folderId = await getFolderId(accessToken, "03 Templates");
  if (!folderId) return null;

  // Find first PPTX file
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '${folderId}' in parents and trashed=false`
      ) +
      "&fields=files(id,name)&pageSize=1",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  const templateFile = data.files?.[0];
  if (!templateFile) return null;

  // Copy-convert to Google Slides
  const copyRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${templateFile.id}/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `[TEMP] ${templateFile.name}`,
        mimeType: "application/vnd.google-apps.presentation",
      }),
    }
  );
  const copyData = (await copyRes.json()) as { id?: string };
  if (!copyData.id) return null;

  return { presentationId: copyData.id, title: templateFile.name };
}



export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET diagnostic: report env var status without creating anything
  if (req.method === "GET") {
    const envFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
    return res.status(200).json({
      ok: true,
      hasDriveFolderId: !!envFolderId,
      driveFolderIdLength: envFolderId.length,
      driveFolderIdPrefix: envFolderId ? envFolderId.substring(0, 12) + "..." : null,
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Read env var at request time (fresh after redeploy)
  const runtimeDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

  let {
    accessToken,
    refreshToken,
    title,
    prospectName,
    prospectCompany,
    offerings,
    suggestedAngle,
    includeOverview,
    includeCaseStudies,
  } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({ error: "Missing accessToken" });
  }

  const presentationTitle =
    title || `${prospectCompany || prospectName || "Partner"} x Brinc Proposal`;

  let presentationId: string;
  let usedTemplate = false;

  // ---- Token validation: refresh if expired ----
  if (refreshToken) {
    const checkRes = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
    );
    if (!checkRes.ok) {
      const newToken = await refreshAccessToken(refreshToken);
      if (newToken) accessToken = newToken;
    }
  }

  try {
    // ---- 1. Template-first: try to copy from 03 Templates ----
    const template = await copyTemplate(accessToken);
    if (template) {
      usedTemplate = true;
      presentationId = template.presentationId;
      // Rename to proposal title
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${presentationId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: presentationTitle }),
        }
      );
    } else {
      // Fallback: create blank
      const createRes = await fetch(
        "https://slides.googleapis.com/v1/presentations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: presentationTitle }),
        }
      );
      const presData = (await createRes.json()) as any;
      if (!createRes.ok) {
        return res.status(400).json({
          error: presData.error?.message || "Failed to create presentation",
        });
      }
      presentationId = presData.presentationId;
    }

    // ---- 2. Get current slide structure ----
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
      body: suggestedAngle
        ? suggestedAngle.split("\n").filter((s: string) => s.trim())
        : ["Building on our strategic alignment and shared vision for innovation."],
    });

    if (offerings && offerings.length > 0) {
      contentSlides.push({
        title: "Proposed Collaboration",
        body: [
          `A tailored engagement between ${prospectCompany || prospectName || "your organization"} and Brinc:`,
          ...offerings.map((o: string) => `\u2022 ${o}`),
        ],
      });
    }

    if (includeOverview) {
      contentSlides.push({
        title: "About Brinc",
        body: [
          "\u2022 12+ years of experience in accelerator and innovation programs",
          "\u2022 75+ programs executed across 20+ countries",
          "\u2022 170+ portfolio companies supported",
          "\u2022 $1.69B+ total portfolio valuation",
          "\u2022 Global presence: MENA, Asia, Europe, Americas",
        ],
      });
    }

    if (includeCaseStudies) {
      contentSlides.push({
        title: "Relevant Experience",
        body: [
          "\u2022 Dubai DET / Hi2 Incubator \u2014 40+ startups, $12M+ raised",
          "\u2022 EDB Manufacturing Accelerator \u2014 15 startups, 5 pilots",
          "\u2022 MBRIF Innovation Fund \u2014 25 startups, 8 commercialized",
          "\u2022 QSTP Partnership \u2014 Tech transfer and scouting",
        ],
      });
    }

    contentSlides.push({
      title: "Next Steps",
      body: [
        "1. Finalize scope and commercial terms",
        "2. Mobilize program team and resources",
        "3. Launch pilot phase (Weeks 1\u20134)",
        "4. Full program execution (Months 2\u201312)",
        "5. Demo Day and portfolio support (Ongoing)",
      ],
    });

    // ---- 4. Build batchUpdate ----
    const requests: any[] = [];
    const now = Date.now();

    // Cover slide: populate placeholders (use insertText only — deleteText fails on empty shapes)
    if (existingSlides.length > 0) {
      const firstSlide = existingSlides[0];
      const elements = firstSlide.pageElements || [];
      const titleBox = elements.find(
        (e: any) =>
          e.shape?.placeholder?.type === "TITLE" ||
          e.shape?.placeholder?.type === "CENTERED_TITLE"
      );
      const subtitleBox = elements.find(
        (e: any) => e.shape?.placeholder?.type === "SUBTITLE"
      );

      // Use insertText with insertionIndex: 0 to overwrite any placeholder text
      if (titleBox) {
        requests.push({
          insertText: {
            objectId: titleBox.objectId,
            insertionIndex: 0,
            text: prospectCompany || prospectName || "Partnership Proposal",
          },
        });
      }
      if (subtitleBox) {
        requests.push({
          insertText: {
            objectId: subtitleBox.objectId,
            insertionIndex: 0,
            text: `Prepared by Brinc | ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
          },
        });
      }
    }

    // Content slides
    for (let i = 0; i < contentSlides.length; i++) {
      const slideId = `slide_${now}_${i}`;
      const titleBoxId = `title_${now}_${i}`;
      const bodyBoxId = `body_${now}_${i}`;
      const slide = contentSlides[i];

      requests.push({
        createSlide: {
          objectId: slideId,
          slideLayoutReference: { predefinedLayout: "BLANK" },
        },
      });

      requests.push({
        createShape: {
          objectId: titleBoxId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 620, unit: "PT" },
              height: { magnitude: 50, unit: "PT" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 40,
              translateY: 40,
              unit: "PT",
            },
          },
        },
      });

      requests.push({
        insertText: { objectId: titleBoxId, text: slide.title },
      });
      requests.push({
        updateTextStyle: {
          objectId: titleBoxId,
          style: {
            bold: true,
            fontSize: { magnitude: 28, unit: "PT" },
            foregroundColor: {
              opaqueColor: {
                rgbColor: { red: 0.11, green: 0.16, blue: 0.29 },
              },
            },
          },
          fields: "bold,fontSize,foregroundColor",
        },
      });

      if (slide.body.length > 0) {
        requests.push({
          createShape: {
            objectId: bodyBoxId,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: slideId,
              size: {
                width: { magnitude: 620, unit: "PT" },
                height: { magnitude: 300, unit: "PT" },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: 40,
                translateY: 100,
                unit: "PT",
              },
            },
          },
        });
        requests.push({
          insertText: {
            objectId: bodyBoxId,
            text: slide.body.join("\n"),
          },
        });
        requests.push({
          updateTextStyle: {
            objectId: bodyBoxId,
            style: {
              fontSize: { magnitude: 14, unit: "PT" },
              foregroundColor: {
                opaqueColor: {
                  rgbColor: { red: 0.33, green: 0.33, blue: 0.33 },
                },
              },
            },
            fields: "fontSize,foregroundColor",
          },
        });
      }
    }

    // ---- 5. Apply batchUpdate ----
    console.log(
      `[Slides] template=${usedTemplate}, requests=${requests.length}`
    );

    const batchRes = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    const batchData = (await batchRes.json()) as Record<string, any>;
    if (!batchRes.ok) {
      console.error("[Slides] Batch failed:", JSON.stringify(batchData));
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${presentationId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return res.status(400).json({
        error: batchData.error?.message || "Failed to add content",
        details: batchData,
      });
    }

    // ---- 6. Move to 01 Generated Proposals ----
    let folderPath = "";
    const hasRootFolder = !!runtimeDriveFolderId;
    console.log("[Slides] Folder move:", {
      hasRootFolder,
      rootFolderPrefix: runtimeDriveFolderId ? runtimeDriveFolderId.substring(0, 10) + "..." : null,
    });

    if (hasRootFolder) {
      try {
        // Find or create the target subfolder under the configured root
        let targetFolderId = await getFolderId(accessToken, "01 Generated Proposals");
        if (!targetFolderId) {
          const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: "01 Generated Proposals",
              mimeType: "application/vnd.google-apps.folder",
              parents: [runtimeDriveFolderId],
            }),
          });
          const folderData = (await createRes.json()) as { id?: string; error?: any };
          if (!folderData.id) {
            throw new Error(`Folder creation failed: ${JSON.stringify(folderData.error)}`);
          }
          targetFolderId = folderData.id;
          console.log("[Slides] Created folder:", targetFolderId);
        } else {
          console.log("[Slides] Found existing folder:", targetFolderId);
        }

        // Move the file: add to target folder, remove from root
        const moveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${presentationId}?addParents=${targetFolderId}&removeParents=root`,
          { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!moveRes.ok) {
          const moveErr = await moveRes.json();
          console.error("[Slides] Move failed:", moveErr);
          throw new Error(moveErr.error?.message || `Move HTTP ${moveRes.status}`);
        }
        console.log("[Slides] File moved to 01 Generated Proposals");
        folderPath = "01 Generated Proposals";
      } catch (e: any) {
        console.error("[Slides] Folder move error:", e.message);
      }
    } else {
      console.warn("[Slides] GOOGLE_DRIVE_FOLDER_ID not set, file stays in Drive root");
    }

    // ---- 7. Return ----
    return res.status(200).json({
      presentationId,
      title: presentationTitle,
      webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: contentSlides.length + 1,
      usedTemplate,
      folderPath,
      hasRootFolder,
    });
  } catch (err: any) {
    console.error("[Slides] Error:", err);
    return res.status(500).json({ error: err.message || "Slides creation failed" });
  }
}
