import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    ok: true,
    method: req.method,
    hasDriveFolder: !!(process.env.GOOGLE_DRIVE_FOLDER_ID || ""),
    envKeys: Object.keys(process.env).filter(k => k.includes("GOOGLE")),
  });
}
