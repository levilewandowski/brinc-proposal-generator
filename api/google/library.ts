const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

function gapi(token: string, url: string, init?: any) {
  return fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init?.headers || {}) },
  }).then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} })));
}

function findFolder(token: string, name: string) {
  if (!DRIVE_ROOT) return Promise.resolve(null);
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='" + name + "' and trashed=false");
  return gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives")
    .then((r) => r.data.files?.[0] || null);
}

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  const token = req.query.accessToken || (req.body || {}).accessToken;
  if (!token) return res.status(400).json({ error: "Missing accessToken" });

  const logs: string[] = [];
  const decks: any[] = [];

  Promise.all([findFolder(token, "02 Source Decks"), findFolder(token, "03 Templates")])
    .then(([sourceId, tmplId]) => {
      logs.push("Source Decks: " + (sourceId ? sourceId.id : "not found"));
      logs.push("Templates: " + (tmplId ? tmplId.id : "not found"));

      const promises: Promise<any>[] = [];
      if (sourceId) {
        const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + sourceId.id + "' in parents and trashed=false");
        promises.push(gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives").then((r) => ({ folder: "02 Source Decks", files: r.data.files || [] })));
      }
      if (tmplId) {
        const q = encodeURIComponent("mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' and '" + tmplId.id + "' in parents and trashed=false");
        promises.push(gapi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives").then((r) => ({ folder: "03 Templates", files: r.data.files || [] })));
      }
      return Promise.all(promises);
    })
    .then((results) => {
      const files: { folder: string; id: string; name: string }[] = [];
      results.forEach((r) => r.files.forEach((f: any) => files.push({ folder: r.folder, id: f.id, name: f.name })));
      logs.push("PPTX files: " + files.length);

      // Extract first 2 files
      let chain = Promise.resolve();
      for (const file of files.slice(0, 2)) {
        chain = chain.then(() =>
          gapi(token, "https://www.googleapis.com/drive/v3/files/" + file.id + "/copy", {
            method: "POST",
            body: JSON.stringify({ name: "[SCAN] " + file.name, mimeType: "application/vnd.google-apps.presentation" }),
          }).then((copied) => {
            if (!copied.data.id) return;
            const tempId = copied.data.id;
            return gapi(token, "https://slides.googleapis.com/v1/presentations/" + tempId + "?fields=slides(objectId,pageElements(shape(text(textElements(content,textRun(content))))))")
              .then((pres) => {
                const slides = pres.data.slides || [];
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
                  return { slideIndex: idx, title: texts[0] || "Slide " + (idx + 1), textCount: texts.length, preview: texts.slice(0, 3).join(" | ").substring(0, 100) };
                });
                decks.push({ fileName: file.name, folder: file.folder, slideCount: slides.length, slides: extracted });
              })
              .finally(() => {
                fetch("https://www.googleapis.com/drive/v3/files/" + tempId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
              });
          }).catch((err: any) => logs.push("ERR " + file.name + ": " + err.message))
        );
      }
      return chain;
    })
    .then(() => res.status(200).json({ ok: true, deckCount: decks.length, totalSlides: decks.reduce((s, d) => s + d.slideCount, 0), decks, logs }))
    .catch((err: any) => res.status(500).json({ ok: false, error: err.message, logs }));
}
