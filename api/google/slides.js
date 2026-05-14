const DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET") {
    return res.end(JSON.stringify({ ok: true, hasDriveFolder: !!DRIVE_ROOT }));
  }
  res.end(JSON.stringify({ ok: false, error: "POST not implemented in debug" }));
}
