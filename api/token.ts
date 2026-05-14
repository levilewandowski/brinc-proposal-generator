const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code, code_verifier, redirect_uri, refreshToken } = req.body || {};
  if (!code || !code_verifier) return res.status(400).json({ error: "Missing code or code_verifier" });

  let accessToken = req.body?.accessToken;

  function doExchange(token: string) {
    return fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirect_uri || "https://brinc-proposal-generator.vercel.app/google/callback",
        grant_type: "authorization_code", code_verifier: String(code_verifier),
      }),
    }).then((r) => r.json());
  }

  doExchange(accessToken)
    .then((tokens: any) => {
      if (tokens.error) throw new Error(tokens.error_description || tokens.error);
      return fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json()).then((user: any) => ({
        email: user.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
      }));
    })
    .then((result) => res.status(200).json({ ok: true, ...result }))
    .catch((err) => res.status(400).json({ ok: false, error: err.message || "Token exchange failed" }));
}
