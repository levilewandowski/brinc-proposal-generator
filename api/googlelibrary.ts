import type { VercelRequest, VercelResponse } from "@vercel/node";

const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

interface SlideInfo {
  slideIndex: number;
  title: string;
  bodyPreview: string;
  layout: string;
  thumbnailUrl: string | null;
}

interface DeckInfo {
  fileId: string;
  fileName: string;
  slideCount: number;
  slides: SlideInfo[];
  tags: string[];
}

/** Get subfolder ID */
async function getFolderId(
  accessToken: string,
  name: string
): Promise<string | null> {
  const searchRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.google-apps.folder' and '${DRIVE_ROOT}' in parents and name='${name}' and trashed=false`
      ) +
      "&fields=files(id)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await searchRes.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id || null;
}

/** List PPTX files in a folder */
async function listPptx(accessToken: string, folderId: string) {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '${folderId}' in parents and trashed=false`
      ) +
      "&fields=files(id,name,modifiedTime)&pageSize=50",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await res.json()) as { files?: any[] };
  return data.files || [];
}

/** Copy a PPTX to a new Google Slides presentation and extract slide metadata */
async function extractDeckSlides(
  accessToken: string,
  fileId: string,
  fileName: string
): Promise<DeckInfo> {
  // Step 1: Convert PPTX to Google Slides by copying with convert=true
  const copyRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `[TEMP] ${fileName}`,
        mimeType: "application/vnd.google-apps.presentation",
      }),
    }
  );
  const copyData = (await copyRes.json()) as { id?: string; error?: any };
  if (!copyData.id) {
    throw new Error(`Copy failed: ${JSON.stringify(copyData.error)}`);
  }
  const tempId = copyData.id;

  try {
    // Step 2: Get all slides
    const slidesRes = await fetch(
      `https://slides.googleapis.com/v1/presentations/${tempId}?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId,placeholderObjectId)),pageElements(shape(shapeProperties,placeholder,contentAlignment,text(textElements(content,textRun))))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const presData = (await slidesRes.json()) as any;
    const slides: any[] = presData.slides || [];

    const slideInfos: SlideInfo[] = slides.map((slide: any, idx: number) => {
      // Extract all text from the slide
      const texts: string[] = [];
      for (const element of slide.pageElements || []) {
        if (element.shape?.text?.textElements) {
          for (const te of element.shape.text.textElements) {
            if (te.textRun?.content) {
              const text = te.textRun.content.trim();
              if (text) texts.push(text);
            }
          }
        }
      }

      const title = texts[0] || `Slide ${idx + 1}`;
      const bodyPreview = texts.slice(1, 4).join(" ").substring(0, 200);

      // Detect layout type
      const layoutId = slide.slideProperties?.layout?.objectId || "";
      let layout = "CONTENT";
      if (layoutId.toLowerCase().includes("title") && layoutId.toLowerCase().includes("only")) layout = "TITLE";
      else if (layoutId.toLowerCase().includes("blank")) layout = "BLANK";
      else if (layoutId.toLowerCase().includes("section")) layout = "SECTION";
      else if (idx === 0) layout = "COVER";

      return {
        slideIndex: idx,
        title,
        bodyPreview,
        layout,
        thumbnailUrl: null, // Can be fetched separately
      };
    });

    // Derive tags from content
    const allText = slideInfos.map((s) => `${s.title} ${s.bodyPreview}`).join(" ").toLowerCase();
    const tags: string[] = [];
    const tagKeywords: Record<string, string[]> = {
      accelerator: ["accelerator"],
      incubator: ["incubator"],
      overview: ["overview", "about brinc", "who we are"],
      casestudy: ["case study", "case studies", "experience", "portfolio"],
      team: ["team", "people", "leadership"],
      financial: ["financial", "budget", "revenue", "funding"],
      timeline: ["timeline", "roadmap", "schedule", "milestone"],
      "next-steps": ["next step", "action", "phase"],
      cover: ["proposal", "partnership"],
    };
    for (const [tag, keywords] of Object.entries(tagKeywords)) {
      if (keywords.some((k) => allText.includes(k))) tags.push(tag);
    }

    return {
      fileId,
      fileName,
      slideCount: slides.length,
      slides: slideInfos,
      tags,
    };
  } finally {
    // Clean up temp file
    await fetch(`https://www.googleapis.com/drive/v3/files/${tempId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}

/** GET /api/google/library — scan and index PPTX files */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = req.query.accessToken as string;
  if (!accessToken) {
    return res.status(400).json({ error: "Missing accessToken" });
  }

  const action = (req.query.action as string) || "scan";

  try {
    if (action === "scan") {
      // Scan all PPTX files in 02 Source Decks and 03 Templates
      const decks: DeckInfo[] = [];

      for (const folderName of ["02 Source Decks", "03 Templates"]) {
        const folderId = await getFolderId(accessToken, folderName);
        if (!folderId) continue;

        const files = await listPptx(accessToken, folderId);
        for (const file of files) {
          try {
            const deck = await extractDeckSlides(accessToken, file.id, file.name);
            decks.push(deck);
          } catch (err: any) {
            console.warn(`[Library] Failed to extract ${file.name}:`, err.message);
            decks.push({
              fileId: file.id,
              fileName: file.name,
              slideCount: 0,
              slides: [],
              tags: [],
              error: err.message,
            } as any);
          }
        }
      }

      return res.status(200).json({
        scannedAt: new Date().toISOString(),
        deckCount: decks.length,
        totalSlides: decks.reduce((sum, d) => sum + d.slideCount, 0),
        decks,
      });
    }

    if (action === "slides") {
      // Return flat list of all indexed slides for the slide library
      const scanRes = await fetch(
        `https://${req.headers.host}/api/google/library?accessToken=${accessToken}&action=scan`
      );
      const scanData = (await scanRes.json()) as { decks?: DeckInfo[] };
      const allSlides: any[] = [];

      for (const deck of scanData.decks || []) {
        for (const slide of deck.slides) {
          allSlides.push({
            ...slide,
            sourceDeck: deck.fileName,
            sourceDeckId: deck.fileId,
            deckTags: deck.tags,
          });
        }
      }

      return res.status(200).json({
        slideCount: allSlides.length,
        slides: allSlides,
      });
    }

    return res.status(400).json({ error: "Unknown action. Use: scan, slides" });
  } catch (err: any) {
    console.error("[Library] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
