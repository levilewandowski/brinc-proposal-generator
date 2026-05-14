const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

function gapi(token: string, url: string, init?: any) {
  return fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init?.headers || {}) },
  }).then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} })));
}

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  // Quick health check
  if (req.method === "GET" && !req.query.accessToken) {
    return res.status(200).json({ ok: true, hasDriveFolder: !!DRIVE_ROOT, msg: "Provide ?accessToken=... to scan" });
  }

  const token = req.query.accessToken || (req.body || {}).accessToken;
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  const logs: string[] = [];
  const decks: any[] = [];

  // Find folders
  const findQ = (name: string) => encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='" + name + "' and trashed=false");

  Promise.all([
    gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + findQ("02 Source Decks") + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives"),
    gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + findQ("03 Templates") + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives"),
    gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + findQ("01 Generated Proposals") + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives"),
  ])
    .then(([source, tmpl, generated]) => {
      const sourceId = source.data.files?.[0]?.id;
      const tmplId = tmpl.data.files?.[0]?.id;
      const genId = generated.data.files?.[0]?.id;

      logs.push("02 Source Decks folder: " + (sourceId || "not found"));
      logs.push("03 Templates folder: " + (tmplId || "not found"));
      logs.push("01 Generated Proposals folder: " + (genId || "not found"));

      // List PPTX files
      const lists: Promise<any>[] = [];
      if (sourceId) {
        const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + sourceId + "' in parents and trashed=false");
        lists.push(gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives").then((r) => ({ folder: "02 Source Decks", files: r.data.files || [] })));
      }
      if (tmplId) {
        const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplId + "' in parents and trashed=false");
        lists.push(gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives").then((r) => ({ folder: "03 Templates", files: r.data.files || [] })));
      }
      return Promise.all(lists);
    })
    .then((folderFiles) => {
      const allFiles: { folder: string; id: string; name: string }[] = [];
      folderFiles.forEach((r) => {
        logs.push(r.folder + ": " + r.files.length + " PPTX file(s)");
        r.files.forEach((f: any) => {
          allFiles.push({ folder: r.folder, id: f.id, name: f.name });
        });
      });

      if (allFiles.length === 0) {
        return res.status(200).json({ ok: true, msg: "No PPTX files found", decks: [], logs });
      }

      // Extract first file only (to avoid timeout)
      const file = allFiles[0];
      logs.push("Extracting: " + file.folder + "/" + file.name);

      return gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
        method: "POST",
        body: JSON.stringify({ name: "[SCAN] " + file.name, mimeType: "application/vnd.google-apps.presentation" }),
      }).then((copied) => {
        if (!copied.data.id) {
          logs.push("Copy failed: " + JSON.stringify(copied.data));
          return res.status(200).json({ ok: true, decks, logs });
        }
        const tempId = copied.data.id;
        return gapi(token, "https://slides.googleapis.com/v1/presentations/" + tempId + "?fields=presentationId,title,slides(objectId,slideProperties(layout(objectId)),pageElements(shape(text(textElements(content,textRun(content))))))")
          .then((pres) => {
            const slides: any[] = pres.data.slides || [];
            logs.push("Slides in " + file.name + ": " + slides.length);

            const categories: Record<string, number> = {};
            const extracted = slides.map((slide: any, idx: number) => {
              const texts: string[] = [];
              for (const el of slide.pageElements || []) {
                if (el.shape?.text?.textElements) {
                  for (const te of el.shape.text.textElements) {
                    const txt = te.textRun?.content?.trim();
                    if (txt) texts.push(txt);
                  }
                }
              }

              const fullText = texts.join(" ").toLowerCase();
              let cat = "content";
              const patterns: Record<string, string[]> = {
                cover: ["brinc", "proposal", "partnership"],
                overview: ["about brinc", "who we are", "overview"],
                team: ["team", "leadership"],
                case_study: ["case study", "portfolio", "experience", "det", "hi2"],
                approach: ["approach", "methodology", "process"],
                next_steps: ["next step", "action", "get started"],
                objectives: ["objective", "goals", "scope"],
                financial: ["budget", "revenue", "financial", "investment"],
              };
              for (const [c, keywords] of Object.entries(patterns)) {
                if (keywords.some((k) => fullText.includes(k))) { cat = c; break; }
              }
              categories[cat] = (categories[cat] || 0) + 1;

              return { slideIndex: idx, title: texts[0] || "Slide " + (idx + 1), textCount: texts.length, category: cat, preview: texts.slice(0, 2).join(" | ").substring(0, 80) };
            });

            decks.push({ fileName: file.name, folder: file.folder, slideCount: slides.length, slides: extracted });
            return res.status(200).json({ ok: true, totalPptxFiles: allFiles.length, fileList: allFiles.map((f) => ({ folder: f.folder, name: f.name })), categories, decks, logs });
          })
          .finally(() => {
            fetch("https://www.googleapis.com/drive/v3/files/" + tempId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
          });
      });
    })
    .catch((err: any) => res.status(500).json({ ok: false, error: err.message, logs }));
}
