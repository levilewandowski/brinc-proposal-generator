import type { VercelRequest, VercelResponse } from "@vercel/node";

const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

/** Get or create a named subfolder under the root. */
async function getFolderId(
  accessToken: string,
  name: string
): Promise<string | null> {
  // Search existing
  const searchRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        `mimeType='application/vnd.google-apps.folder' and ` +
          `'${DRIVE_ROOT}' in parents and ` +
          `name='${name}' and trashed=false`
      ) +
      "&spaces=drive&fields=files(id,name)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = (await searchRes.json()) as { files?: { id: string }[] };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [DRIVE_ROOT],
    }),
  });
  const folder = (await createRes.json()) as { id?: string };
  return folder.id || null;
}

/** List files in a folder. */
async function listFiles(
  accessToken: string,
  folderId: string,
  mimeTypeFilter?: string
): Promise<any[]> {
  let query = `'${folderId}' in parents and trashed=false`;
  if (mimeTypeFilter) {
    query += ` and mimeType='${mimeTypeFilter}'`;
  }

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(query) +
      "&fields=files(id,name,mimeType,modifiedTime,thumbnailLink,webViewLink,size)&pageSize=100",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await res.json()) as { files?: any[] };
  return data.files || [];
}

/** GET /api/google/drive — list folders or folder contents */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = req.query.accessToken as string;
  if (!accessToken) {
    return res.status(400).json({ error: "Missing accessToken" });
  }

  const action = req.query.action as string;

  try {
    switch (action) {
      case "folders": {
        // Ensure all folders exist and return their IDs
        const folders: Record<string, string | null> = {};
        const folderNames = [
          "01 Generated Proposals",
          "02 Source Decks",
          "03 Templates",
          "04 Exports",
          "05 Archive",
        ];
        for (const name of folderNames) {
          folders[name] = await getFolderId(accessToken, name);
        }
        return res.status(200).json({ folders });
      }

      case "list": {
        const folderName = req.query.folder as string;
        if (!folderName) {
          return res.status(400).json({ error: "Missing folder param" });
        }
        const folderId = await getFolderId(accessToken, folderName);
        if (!folderId) {
          return res.status(404).json({ error: `Folder '${folderName}' not found` });
        }
        const files = await listFiles(accessToken, folderId);
        return res.status(200).json({ folder: folderName, folderId, files });
      }

      case "pptx": {
        // List all PPTX files in 02 Source Decks and 03 Templates
        const results: Record<string, any[]> = {};
        for (const folderName of ["02 Source Decks", "03 Templates"]) {
          const folderId = await getFolderId(accessToken, folderName);
          if (folderId) {
            results[folderName] = await listFiles(
              accessToken,
              folderId,
              "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            );
          }
        }
        return res.status(200).json(results);
      }

      default:
        return res.status(400).json({
          error: "Unknown action. Use: folders, list?folder=NAME, pptx",
        });
    }
  } catch (err: any) {
    console.error("[Drive] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
