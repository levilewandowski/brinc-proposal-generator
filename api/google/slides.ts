const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasDriveFolder: !!DRIVE_ROOT,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  let accessToken = body.accessToken;
  const refreshToken = body.refreshToken;

  if (!accessToken) {
    return res.status(400).json({ ok: false, error: "Missing accessToken" });
  }

  const title = body.title || (body.prospectCompany || body.prospectName || "Partner") + " x Brinc";
  const prospectName = body.prospectName || "";
  const prospectCompany = body.prospectCompany || "";
  const offerings = body.offerings || [];
  const suggestedAngle = body.suggestedAngle || "";
  const includeOverview = body.includeOverview;
  const includeCaseStudies = body.includeCaseStudies;

  const logs: string[] = [];

  // Check if token needs refresh
  function ensureToken() {
    if (!refreshToken) return Promise.resolve();
    return fetch("https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken)
      .then((r) => {
        if (r.ok) return;
        // Token expired, refresh it
        logs.push("Token expired, refreshing...");
        return fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
            grant_type: "refresh_token",
          }),
        })
          .then((r) => r.json())
          .then((d: any) => {
            if (d.access_token) {
              accessToken = d.access_token;
              logs.push("Token refreshed");
            }
          });
      });
  }

  // Helper to call Google APIs
  function gapi(url: string, init?: any) {
    return fetch(url, {
      ...init,
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    }).then((r) =>
      r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} }))
    );
  }

  // 1. Ensure token is valid, then create presentation
  ensureToken().then(() => {
    return gapi("https://slides.googleapis.com/v1/presentations", {
    method: "POST",
    body: JSON.stringify({ title }),
  })
    .then((created) => {
      if (!created.ok) {
        throw new Error(created.data.error?.message || "Create failed");
      }
      const presId = created.data.presentationId;
      logs.push("Created: " + presId);

      // 2. Build content slides
      const reqs: any[] = [];
      const now = Date.now();
      let slideIdx = 0;

      function addSlide(slideTitle: string, slideBody: string[]) {
        const sid = "s" + now + "_" + slideIdx;
        const tid = "t" + now + "_" + slideIdx;
        const bid = "b" + now + "_" + slideIdx;
        slideIdx++;

        reqs.push({
          createSlide: {
            objectId: sid,
            slideLayoutReference: { predefinedLayout: "BLANK" },
          },
        });

        reqs.push({
          createShape: {
            objectId: tid,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: sid,
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

        reqs.push({ insertText: { objectId: tid, text: slideTitle } });

        reqs.push({
          updateTextStyle: {
            objectId: tid,
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

        if (slideBody.length > 0) {
          reqs.push({
            createShape: {
              objectId: bid,
              shapeType: "TEXT_BOX",
              elementProperties: {
                pageObjectId: sid,
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

          reqs.push({
            insertText: { objectId: bid, text: slideBody.join("\n") },
          });

          reqs.push({
            updateTextStyle: {
              objectId: bid,
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

      // Add all content slides
      addSlide(
        "Strategic Context",
        suggestedAngle ? suggestedAngle.split("\n").filter(Boolean) : ["Building on strategic alignment."]
      );

      if (offerings.length > 0) {
        const lines = ["For " + (prospectCompany || prospectName || "partner") + ":"];
        for (const o of offerings) {
          lines.push("- " + o);
        }
        addSlide("Proposed Collaboration", lines);
      }

      if (includeOverview) {
        addSlide("About Brinc", [
          "- 12+ years in accelerator programs",
          "- 75+ programs, 20+ countries",
          "- 170+ portfolio companies",
          "- $1.69B+ valuation",
          "- Global: MENA, Asia, Europe, Americas",
        ]);
      }

      if (includeCaseStudies) {
        addSlide("Relevant Experience", [
          "- Dubai DET / Hi2 Incubator",
          "- EDB Manufacturing Accelerator",
          "- MBRIF Innovation Fund",
          "- QSTP Partnership",
        ]);
      }

      addSlide("Next Steps", [
        "1. Finalize scope",
        "2. Mobilize team",
        "3. Launch pilot",
        "4. Full execution",
        "5. Demo Day",
      ]);

      // 3. Apply batchUpdate
      return gapi(
        "https://slides.googleapis.com/v1/presentations/" + presId + ":batchUpdate",
        {
          method: "POST",
          body: JSON.stringify({ requests: reqs }),
        }
      ).then((batch) => {
        if (!batch.ok) {
          // Clean up blank presentation
          fetch("https://www.googleapis.com/drive/v3/files/" + presId, {
            method: "DELETE",
            headers: { Authorization: "Bearer " + accessToken },
          }).catch(() => {});
          throw new Error(batch.data.error?.message || "Batch failed");
        }

        logs.push("Batch: " + reqs.length + " reqs");

        // 4. Drive folder move with supportsAllDrives
        let folderPath = "";

        if (DRIVE_ROOT) {
          logs.push("Root: " + DRIVE_ROOT.substring(0, 10) + "...");

          // Step A: Get actual current parents
          return fetch(
            "https://www.googleapis.com/drive/v3/files/" + presId + "?fields=parents&supportsAllDrives=true",
            { headers: { Authorization: "Bearer " + accessToken } }
          )
            .then((r) => r.json())
            .then((before: any) => {
              const currentParents = before.parents || ["root"];
              logs.push("Current parents: " + JSON.stringify(currentParents));

              // Step B: Find or create target folder (with Shared Drive support)
              // First, detect driveId of the root folder
              return fetch(
                "https://www.googleapis.com/drive/v3/files/" + DRIVE_ROOT + "?fields=driveId&supportsAllDrives=true",
                { headers: { Authorization: "Bearer " + accessToken } }
              )
                .then((r) => r.json())
                .then((rootMeta: any) => {
                  const driveId = rootMeta.driveId || "";
                  logs.push("driveId: " + (driveId || "(My Drive)"));

                  // Search for existing folder with Shared Drive params
                  const q = encodeURIComponent(
                    "mimeType='application/vnd.google-apps.folder' and '" + DRIVE_ROOT + "' in parents and name='01 Generated Proposals' and trashed=false"
                  );
                  const searchUrl =
                    "https://www.googleapis.com/drive/v3/files?q=" + q +
                    "&fields=files(id,name,createdTime)" +
                    "&supportsAllDrives=true" +
                    "&includeItemsFromAllDrives=true" +
                    "&corpora=allDrives" +
                    "&orderBy=createdTime";

                  logs.push("Search URL: " + searchUrl.substring(0, 80) + "...");

                  return fetch(searchUrl, { headers: { Authorization: "Bearer " + accessToken } })
                    .then((r) => r.json())
                    .then((search: any) => {
                      const files = search.files || [];
                      logs.push("Search returned " + files.length + " folder(s)");

                      if (files.length > 0) {
                        // Prefer oldest existing folder
                        const oldest = files[0];
                        logs.push("Reusing oldest folder: " + oldest.id + " (" + oldest.name + ", " + oldest.createdTime + ")");
                        if (files.length > 1) {
                          logs.push("Note: " + files.length + " folders with same name exist");
                        }
                        return { id: oldest.id, currentParents };
                      }

                      // Create new folder
                      logs.push("No existing folder found, creating...");
                      return fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
                        method: "POST",
                        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: "01 Generated Proposals",
                          mimeType: "application/vnd.google-apps.folder",
                          parents: [DRIVE_ROOT],
                        }),
                      })
                        .then((r) => r.json())
                        .then((d: any) => {
                          logs.push("Created folder: " + d.id);
                          return { id: d.id, currentParents };
                        });
                    });
                });
            })
            .then(({ id: folderId, currentParents }: any) => {
              if (!folderId) {
                logs.push("No folder ID");
                return presId;
              }

              // Step C: Move file (remove actual parents, add target)
              const removeParents = currentParents.join(",");
              logs.push("Moving: remove=" + removeParents + ", add=" + folderId);

              return fetch(
                "https://www.googleapis.com/drive/v3/files/" + presId +
                  "?addParents=" + folderId +
                  "&removeParents=" + removeParents +
                  "&supportsAllDrives=true&fields=id,parents",
                { method: "PATCH", headers: { Authorization: "Bearer " + accessToken } }
              )
                .then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} })))
                .then((moveResult) => {
                  logs.push("Move response: HTTP " + moveResult.status);
                  if (!moveResult.ok) {
                    logs.push("Move error: " + JSON.stringify(moveResult.data));
                    return presId;
                  }

                  // Step D: Verify
                  const finalParents = moveResult.data.parents || [];
                  const inTarget = finalParents.includes(folderId);
                  logs.push("Final parents: " + JSON.stringify(finalParents));
                  logs.push("In target folder: " + inTarget);

                  if (inTarget) folderPath = "01 Generated Proposals";
                  return presId;
                });
            })
            .then(() => ({
              ok: true,
              presentationId: presId,
              title,
              webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit",
              slideCount: slideIdx + 1,
              folderPath,
              logs,
            }));
        }

        return {
          ok: true,
          presentationId: presId,
          title,
          webViewLink: "https://docs.google.com/presentation/d/" + presId + "/edit",
          slideCount: slideIdx + 1,
          folderPath: "",
          logs,
        };
      });
    })
  })
    .then((result: any) => res.status(200).json(result))
    .catch((err: any) => {
      console.error("[Slides] Error:", err);
      res.status(500).json({ ok: false, error: err.message, logs });
    });
}
