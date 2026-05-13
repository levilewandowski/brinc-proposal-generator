import type { VercelRequest, VercelResponse } from "@vercel/node";

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

interface SlideRequest {
  title?: string;
  subtitle?: string;
  body?: string[];
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

  const presentationTitle = title || `${prospectCompany || prospectName || "Partner"} x Brinc Proposal`;

  try {
    // 1. Create a blank presentation
    const createRes = await fetch("https://slides.googleapis.com/v1/presentations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: presentationTitle }),
    });

    const presentation = (await createRes.json()) as Record<string, any>;
    if (!createRes.ok) {
      console.error("[Slides] Create error:", presentation);
      return res.status(400).json({
        error: presentation.error?.message || "Failed to create presentation",
      });
    }

    const presentationId = presentation.presentationId;

    // 2. Build slide content via batchUpdate
    const requests: any[] = [];

    // Get the first slide ID
    const firstSlideId = presentation.slides?.[0]?.objectId;

    // Title slide: set title and subtitle on the first slide
    if (firstSlideId) {
      const firstSlide = presentation.slides[0];
      const titleBox = firstSlide.pageElements?.find((e: any) =>
        e.shape?.placeholder?.type === "TITLE"
      );
      const subtitleBox = firstSlide.pageElements?.find((e: any) =>
        e.shape?.placeholder?.type === "SUBTITLE"
      );

      if (titleBox) {
        requests.push({
          insertText: {
            objectId: titleBox.objectId,
            text: prospectCompany || prospectName || "Partnership Proposal",
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

    // Add content slides
    const slideContent: SlideRequest[] = [];

    if (suggestedAngle) {
      slideContent.push({ title: "Strategic Context", body: [suggestedAngle] });
    }

    if (offerings && offerings.length > 0) {
      slideContent.push({
        title: "Proposed Collaboration",
        body: offerings.map((o: string) => `• ${o}`),
      });
    }

    if (includeOverview) {
      slideContent.push({
        title: "About Brinc",
        body: [
          "12+ years of experience in accelerator and innovation programs",
          "75+ programs executed across 20+ countries",
          "170+ portfolio companies supported",
          "$1.69B+ total portfolio valuation",
          "Global presence: MENA, Asia, Europe, Americas",
        ],
      });
    }

    if (includeCaseStudies) {
      slideContent.push({
        title: "Relevant Experience",
        body: [
          "Dubai DET / Hi2 Incubator — 40+ startups, $12M+ raised",
          "EDB Manufacturing Accelerator — 15 startups, 5 pilots",
          "MBRIF Innovation Fund — 25 startups, 8 commercialized",
          "QSTP Partnership — Tech transfer and scouting",
        ],
      });
    }

    slideContent.push({
      title: "Next Steps",
      body: [
        "1. Finalize scope and commercial terms",
        "2. Mobilize program team and resources",
        "3. Launch pilot phase (Weeks 1-4)",
        "4. Full program execution (Months 2-12)",
        "5. Demo Day and portfolio support (Ongoing)",
      ],
    });

    // Generate unique slide IDs
    for (let i = 0; i < slideContent.length; i++) {
      const slideId = `slide_${Date.now()}_${i}`;
      const titleId = `title_${Date.now()}_${i}`;
      const bodyId = `body_${Date.now()}_${i}`;

      requests.push({
        createSlide: {
          objectId: slideId,
          slideLayoutReference: { predefinedLayout: "BLANK" },
        },
      });

      requests.push({
        createShape: {
          objectId: titleId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: slideId,
            size: { width: { magnitude: 600, unit: "PT" }, height: { magnitude: 50, unit: "PT" } },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: { magnitude: 40, unit: "PT" },
              translateY: { magnitude: 40, unit: "PT" },
              unit: "PT",
            },
          },
        },
      });

      requests.push({
        insertText: { objectId: titleId, text: slideContent[i].title },
      });

      requests.push({
        updateTextStyle: {
          objectId: titleId,
          style: {
            bold: true,
            fontSize: { magnitude: 28, unit: "PT" },
            foregroundColor: { opaqueColor: { rgbColor: { red: 0.11, green: 0.16, blue: 0.29 } } },
          },
          fields: "bold,fontSize,foregroundColor",
        },
      });

      if (slideContent[i].body && slideContent[i].body.length > 0) {
        requests.push({
          createShape: {
            objectId: bodyId,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: slideId,
              size: { width: { magnitude: 600, unit: "PT" }, height: { magnitude: 300, unit: "PT" } },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: { magnitude: 40, unit: "PT" },
                translateY: { magnitude: 100, unit: "PT" },
                unit: "PT",
              },
            },
          },
        });

        requests.push({
          insertText: {
            objectId: bodyId,
            text: slideContent[i].body.join("\n"),
          },
        });

        requests.push({
          updateTextStyle: {
            objectId: bodyId,
            style: {
              fontSize: { magnitude: 14, unit: "PT" },
              foregroundColor: { opaqueColor: { rgbColor: { red: 0.33, green: 0.33, blue: 0.33 } } },
            },
            fields: "fontSize,foregroundColor",
          },
        });
      }
    }

    // Apply batch update
    if (requests.length > 0) {
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
        console.error("[Slides] Batch update error:", batchData);
        // Continue anyway — the blank presentation was created
      }
    }

    // 3. Move to Drive folder if configured
    if (DRIVE_FOLDER_ID) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${presentationId}?addParents=${DRIVE_FOLDER_ID}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    }

    // 4. Return the link
    return res.status(200).json({
      presentationId,
      title: presentationTitle,
      webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: slideContent.length + 1, // +1 for title slide
    });
  } catch (err: any) {
    console.error("[Slides] Error:", err);
    return res.status(500).json({ error: err.message || "Slides creation failed" });
  }
}
