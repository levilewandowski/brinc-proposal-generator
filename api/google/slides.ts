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
  const accessToken = body.accessToken;

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

  // 1. Create blank presentation
  gapi("https://slides.googleapis.com/v1/presentations", {
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

        // 4. Drive folder move
        let folderPath = "";

        if (DRIVE_ROOT) {
          logs.push("Root: " + DRIVE_ROOT.substring(0, 10) + "...");

          const q = encodeURIComponent(
            "mimeType='application/vnd.google-apps.folder' and '" +
              DRIVE_ROOT +
              "' in parents and name='01 Generated Proposals' and trashed=false"
          );

          return fetch(
            "https://www.googleapis.com/drive/v3/files?q=" +
              q +
              "&fields=files(id)",
            { headers: { Authorization: "Bearer " + accessToken } }
          )
            .then((r) => r.json())
            .then((search: any) => {
              const fid = search.files?.[0]?.id;
              if (fid) {
                logs.push("Found folder: " + fid);
                return fid;
              }
              // Create folder
              return fetch("https://www.googleapis.com/drive/v3/files", {
                method: "POST",
                headers: {
                  Authorization: "Bearer " + accessToken,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: "01 Generated Proposals",
                  mimeType: "application/vnd.google-apps.folder",
                  parents: [DRIVE_ROOT],
                }),
              })
                .then((r) => r.json())
                .then((d: any) => {
                  logs.push("Created folder: " + d.id);
                  return d.id;
                });
            })
            .then((folderId) => {
              if (!folderId) {
                logs.push("No folder ID");
                return presId;
              }

              return fetch(
                "https://www.googleapis.com/drive/v3/files/" +
                  presId +
                  "?addParents=" +
                  folderId +
                  "&removeParents=root",
                {
                  method: "PATCH",
                  headers: { Authorization: "Bearer " + accessToken },
                }
              )
                .then((r) => {
                  logs.push("Move HTTP: " + r.status);
                  return r.ok;
                })
                .then(() => {
                  return fetch(
                    "https://www.googleapis.com/drive/v3/files/" +
                      presId +
                      "?fields=parents",
                    { headers: { Authorization: "Bearer " + accessToken } }
                  )
                    .then((r) => r.json())
                    .then((after: any) => {
                      const inTarget = (after.parents || []).includes(folderId);
                      logs.push("In folder: " + inTarget);
                      if (inTarget) folderPath = "01 Generated Proposals";
                      return presId;
                    });
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
    .then((result: any) => res.status(200).json(result))
    .catch((err: any) => {
      console.error("[Slides] Error:", err);
      res.status(500).json({ ok: false, error: err.message, logs });
    });
}
