const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

function gapi(token: string, url: string, init?: any) {
  return fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init?.headers || {}) },
  }).then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} })));
}

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && !req.query.accessToken) {
    return res.status(200).json({ ok: true, hasDriveFolder: !!DRIVE_ROOT, msg: "Provide ?accessToken=... to scan" });
  }

  const token = req.query.accessToken || (req.body || {}).accessToken;
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  const logs: string[] = [];
  const findQ = (name: string) => encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='" + name + "' and trashed=false");

  // Step 1: Find the three main folders
  Promise.all([
    gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + findQ("02 Source Decks") + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives"),
    gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + findQ("03 Templates") + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives"),
  ]).then(([source, tmpl]) => {
    const sourceId = source.data.files?.[0]?.id;
    const tmplId = tmpl.data.files?.[0]?.id;

    logs.push("02 Source Decks folder: " + (sourceId || "not found"));
    logs.push("03 Templates folder: " + (tmplId || "not found"));

    // Step 2: List PPTX files in both folders
    const lists: Promise<any>[] = [];
    if (sourceId) {
      const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + sourceId + "' in parents and trashed=false");
      lists.push(gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives").then((r) => ({ folder: "02 Source Decks", files: r.data.files || [] })));
    }
    if (tmplId) {
      const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplId + "' in parents and trashed=false");
      lists.push(gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives").then((r) => ({ folder: "03 Templates", files: r.data.files || [] })));
    }
    return Promise.all(lists).then((folderFiles) => ({ folderFiles, sourceId, tmplId }));
  }).then(({ folderFiles, sourceId, tmplId }) => {
    const allFiles: { folder: string; id: string; name: string }[] = [];
    folderFiles.forEach((r) => {
      logs.push(r.folder + ": " + r.files.length + " PPTX file(s)");
      r.files.forEach((f: any) => allFiles.push({ folder: r.folder, id: f.id, name: f.name }));
    });

    if (allFiles.length === 0) {
      return res.status(200).json({ ok: true, msg: "No PPTX files found", patterns: null, fileList: [], logs });
    }

    // Step 3: Extract patterns from up to 5 files (limit to avoid timeout)
    const filesToScan = allFiles.slice(0, 5);
    logs.push("Scanning " + filesToScan.length + " file(s) for patterns...");

    return extractPatterns(token, filesToScan, logs).then((patterns) => {
      return res.status(200).json({
        ok: true,
        totalPptxFiles: allFiles.length,
        scannedFiles: filesToScan.length,
        fileList: allFiles.map((f) => ({ folder: f.folder, name: f.name })),
        patterns,
        logs,
      });
    });
  }).catch((err: any) => res.status(500).json({ ok: false, error: err.message, logs }));
}

// Extract rich patterns from multiple decks
async function extractPatterns(token: string, files: { folder: string; id: string; name: string }[], logs: string[]) {
  const sectionOrderCounts: Record<string, number> = {};
  const sectionContentSamples: Record<string, string[]> = {};
  const layoutTypes: Record<string, number> = {};
  const commonPhrases: Record<string, number> = {};
  const fileSummaries: any[] = [];

  for (const file of files) {
    try {
      // Copy to Google Slides format so we can read it
      const copied = await gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
        method: "POST",
        body: JSON.stringify({ name: "[SCAN] " + file.name, mimeType: "application/vnd.google-apps.presentation" }),
      });

      if (!copied.data.id) {
        logs.push("Skip (copy failed): " + file.name);
        continue;
      }

      const tempId = copied.data.id;

      try {
        const pres = await gapi(token, "https://slides.googleapis.com/v1/presentations/" + tempId + "?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId)),pageElements(shape(text(textElements(content,textRun(content,style(bold,fontSize,foregroundColor))))),pageElements(shape(shapeType))))");
        const slides: any[] = pres.data.slides || [];

        const fileSections: string[] = [];

        for (let idx = 0; idx < slides.length; idx++) {
          const slide = slides[idx];
          const texts: string[] = [];
          const boldTexts: string[] = [];
          let hasShape = false;

          for (const el of slide.pageElements || []) {
            if (el.shape) {
              hasShape = true;
              if (el.shape.text?.textElements) {
                for (const te of el.shape.text.textElements) {
                  const txt = te.textRun?.content?.trim();
                  if (txt) {
                    texts.push(txt);
                    if (te.textRun?.style?.bold) boldTexts.push(txt);
                  }
                }
              }
            }
          }

          const fullText = texts.join(" ").toLowerCase();

          // Categorize slide
          let cat = "content";
          const patterns: Record<string, string[]> = {
            cover: ["brinc", "proposal", "partnership", "collaboration", "opportunity"],
            overview: ["about brinc", "who we are", "overview", "about us", "company overview"],
            track_record: ["track record", "portfolio", "metrics", "numbers", "results", "achievements"],
            team: ["team", "leadership", "people", "experts"],
            case_study: ["case study", "case studies", "portfolio", "experience", "det", "hi2", "accelerator", "program"],
            approach: ["approach", "methodology", "process", "how we work", "our approach"],
            next_steps: ["next step", "action", "get started", "timeline", "roadmap", "moving forward"],
            objectives: ["objective", "goals", "scope", "aim", "purpose"],
            financial: ["budget", "revenue", "financial", "investment", "funding", "cost"],
            value_proposition: ["value", "why brinc", "differentiator", "advantage", "unique"],
            deliverables: ["deliverable", "output", "milestone", "phase", "module"],
          };

          for (const [c, keywords] of Object.entries(patterns)) {
            if (keywords.some((k) => fullText.includes(k))) { cat = c; break; }
          }

          // Determine layout type
          let layout = "text";
          if (slide.pageElements && slide.pageElements.length > 3) layout = "complex";
          else if (boldTexts.length > 0 && texts.length > 1) layout = "heading_body";
          else if (boldTexts.length > 0) layout = "title_only";
          layoutTypes[layout] = (layoutTypes[layout] || 0) + 1;

          // Collect section ordering
          fileSections.push(cat);

          // Collect content samples
          if (!sectionContentSamples[cat]) sectionContentSamples[cat] = [];
          if (texts.length > 1) {
            const sample = texts.slice(0, 3).join(" | ").substring(0, 120);
            if (sample.length > 10) sectionContentSamples[cat].push(sample);
          }

          // Track common bigrams/phrases
          const words = fullText.split(/\s+/).filter((w) => w.length > 3);
          for (let i = 0; i < words.length - 1; i++) {
            const phrase = words[i] + " " + words[i + 1];
            if (!["this is", "that the", "with the", "for the", "from the"].includes(phrase)) {
              commonPhrases[phrase] = (commonPhrases[phrase] || 0) + 1;
            }
          }
        }

        // Count section order sequences
        const orderKey = fileSections.join(" > ");
        sectionOrderCounts[orderKey] = (sectionOrderCounts[orderKey] || 0) + 1;

        fileSummaries.push({
          fileName: file.name,
          folder: file.folder,
          slideCount: slides.length,
          sectionFlow: fileSections,
        });

        logs.push("Scanned: " + file.name + " (" + slides.length + " slides, sections: " + fileSections.join(", ") + ")");

      } finally {
        // Clean up temp copy
        fetch("https://www.googleapis.com/drive/v3/files/" + tempId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
      }
    } catch (err: any) {
      logs.push("Error scanning " + file.name + ": " + err.message);
    }
  }

  // Build inferred section order from most common flow
  const inferredOrder = inferSectionOrder(sectionOrderCounts);

  // Get top phrases
  const topPhrases = Object.entries(commonPhrases)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([phrase, count]) => ({ phrase, count }));

  // Build pattern output
  return {
    inferredSectionOrder: inferredOrder,
    sectionContentSamples: Object.fromEntries(
      Object.entries(sectionContentSamples).map(([k, v]) => [k, v.slice(0, 5)])
    ),
    layoutPreferences: layoutTypes,
    topPhrases,
    fileSummaries,
  };
}

function inferSectionOrder(orderCounts: Record<string, number>): string[] {
  // Find most common section sequence
  const entries = Object.entries(orderCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return ["cover", "overview", "approach", "case_study", "next_steps"];

  // Use the most common flow, or merge multiple flows
  const bestFlow = entries[0][0].split(" > ");

  // Normalize: ensure cover is first, next_steps is last
  const hasCover = bestFlow.includes("cover");
  const hasNextSteps = bestFlow.includes("next_steps");

  let normalized = [...bestFlow];
  if (!hasCover) normalized.unshift("cover");
  if (!hasNextSteps) normalized.push("next_steps");

  // Deduplicate while preserving order
  const seen = new Set<string>();
  normalized = normalized.filter((s) => { if (seen.has(s)) return false; seen.add(s); return true; });

  return normalized;
}
