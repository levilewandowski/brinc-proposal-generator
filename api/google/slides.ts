import type { VercelRequest, VercelResponse } from "@vercel/node";

const DRIVE_ROOT_FOLDER = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

interface SlideContent {
  title: string;
  body: string[];
}

/** Look up or create "01 Generated Proposals" subfolder under the root folder. */
async function getGeneratedProposalsFolderId(
  accessToken: string,
  rootFolderId: string
): Promise<string> {
  // Search for existing subfolder
  const searchRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.google-apps.folder' and ` +
          `'${rootFolderId}' in parents and ` +
          `name='01 Generated Proposals' and trashed=false`
      ) +
      "&spaces=drive&fields=files(id,name)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = (await searchRes.json()) as { files?: { id: string; name: string }[] };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create the subfolder
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "01 Generated Proposals",
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    }),
  });
  const folder = (await createRes.json()) as { id?: string };
  if (!folder.id) throw new Error("Failed to create '01 Generated Proposals' folder");
  return folder.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    accessToken,
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

  try {
    // ---- 1. Create blank presentation ----
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

    const presentation = (await createRes.json()) as Record<string, any>;
    if (!createRes.ok) {
      console.error("[Slides] Create error:", presentation);
      return res.status(400).json({
        error:
          presentation.error?.message || "Failed to create presentation",
      });
    }

    const presentationId = presentation.presentationId as string;
    const firstSlideId = presentation.slides?.[0]?.objectId as string;

    // ---- 2. Build all slide content ----
    const contentSlides: SlideContent[] = [];

    if (suggestedAngle) {
      contentSlides.push({
        title: "Strategic Context",
        body: [suggestedAngle],
      });
    }

    if (offerings && offerings.length > 0) {
      contentSlides.push({
        title: "Proposed Collaboration",
        body: offerings.map((o: string) => `\u2022 ${o}`),
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

    // ---- 3. Build batchUpdate requests ----
    const requests: any[] = [];
    const now = Date.now();

    // --- Title slide: populate existing placeholders ---
    if (firstSlideId) {
      const firstSlide = presentation.slides[0];
      const titleBox = firstSlide.pageElements?.find(
        (e: any) => e.shape?.placeholder?.type === "TITLE"
      );
      const subtitleBox = firstSlide.pageElements?.find(
        (e: any) => e.shape?.placeholder?.type === "SUBTITLE"
      );

      if (titleBox) {
        requests.push({
          insertText: {
            objectId: titleBox.objectId,
            text:
              prospectCompany || prospectName || "Partnership Proposal",
          },
        });
      }
      if (subtitleBox) {
        requests.push({
          insertText: {
            objectId: subtitleBox.objectId,
            text: `Prepared by Brinc | ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
          },
        });
      }
    }

    // --- Content slides ---
    for (let i = 0; i < contentSlides.length; i++) {
      const slideId = `slide_${now}_${i}`;
      const titleBoxId = `title_${now}_${i}`;
      const bodyBoxId = `body_${now}_${i}`;
      const slide = contentSlides[i];

      // 3a. Create blank slide
      requests.push({
        createSlide: {
          objectId: slideId,
          slideLayoutReference: { predefinedLayout: "BLANK" },
        },
      });

      // 3b. Create title text box
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
            // Transform: plain numbers (points), NOT {magnitude, unit} objects
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

      // 3c. Insert title text
      requests.push({
        insertText: {
          objectId: titleBoxId,
          text: slide.title,
        },
      });

      // 3d. Style title text
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

      // 3e. Create body text box
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

        // 3f. Insert body text
        requests.push({
          insertText: {
            objectId: bodyBoxId,
            text: slide.body.join("\n"),
          },
        });

        // 3g. Style body text
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

    // ---- 4. Apply batchUpdate ----
    console.log("[Slides] Sending batchUpdate with", requests.length, "requests");

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
      console.error("[Slides] BatchUpdate failed:", JSON.stringify(batchData, null, 2));
      // Delete the blank presentation since batch failed
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${presentationId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      return res.status(400).json({
        error: batchData.error?.message || "Failed to add content to slides",
        details: batchData,
      });
    }

    // Log any partial failures (warnings) from batchUpdate
    if (batchData.replies) {
      const errors = batchData.replies.filter((r: any) => r.error);
      if (errors.length > 0) {
        console.warn("[Slides] BatchUpdate partial failures:", errors);
      }
    }

    // ---- 5. Move to Drive folder ----
    if (DRIVE_ROOT_FOLDER) {
      try {
        const targetFolderId = await getGeneratedProposalsFolderId(
          accessToken,
          DRIVE_ROOT_FOLDER
        );

        await fetch(
          `https://www.googleapis.com/drive/v3/files/${presentationId}?addParents=${targetFolderId}&removeParents=root`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      } catch (folderErr: any) {
        console.warn("[Slides] Folder move warning:", folderErr.message);
        // Non-fatal: still return the presentation link
      }
    }

    // ---- 6. Return result ----
    return res.status(200).json({
      presentationId,
      title: presentationTitle,
      webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: contentSlides.length + 1, // +1 for title slide
    });
  } catch (err: any) {
    console.error("[Slides] Error:", err);
    return res.status(500).json({ error: err.message || "Slides creation failed" });
  }
}
