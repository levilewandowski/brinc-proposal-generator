export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        hasDriveFolder: !!(process.env.GOOGLE_DRIVE_FOLDER_ID || ""),
        drivePrefix: (process.env.GOOGLE_DRIVE_FOLDER_ID || "").substring(0, 10) || null,
        method: "GET",
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ ok: false, error: "Missing accessToken" });

    return res.status(200).json({ ok: true, msg: "POST received" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
