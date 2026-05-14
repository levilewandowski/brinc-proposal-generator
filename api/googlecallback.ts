import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string;
  const error = req.query.error as string;

  if (error) {
    return res.redirect(`/?google_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect("/?google_error=no_code");
  }

  return res.redirect(`/?google_code=${encodeURIComponent(code)}`);
}
