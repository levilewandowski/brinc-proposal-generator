export default function handler(req: any, res: any) {
  const code = req.query.code;
  const error = req.query.error;
  if (error) return res.redirect(`/?google_error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect("/?google_error=no_code");
  return res.redirect(`/?google_code=${encodeURIComponent(code)}`);
}
