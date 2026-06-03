// Minimal ping endpoint — no imports, just JSON response
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, message: "pptx-ping" }));
}
