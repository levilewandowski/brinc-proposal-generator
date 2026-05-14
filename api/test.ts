export default function handler(req: any, res: any) {
  res.status(200).json({ ok: true, env: !!(process.env.GOOGLE_DRIVE_FOLDER_ID || "") });
}
