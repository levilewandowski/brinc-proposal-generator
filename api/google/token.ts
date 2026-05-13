import type { VercelRequest, VercelResponse } from "@vercel/node";

const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, code_verifier, redirect_uri } = req.body || {};

  if (!code || !code_verifier) {
    return res.status(400).json({ error: "Missing code or code_verifier" });
  }

  try {
    // Exchange code for tokens with Google (server-side, includes client_secret)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirect_uri || "https://brinc-proposal-generator.vercel.app/google/callback",
        grant_type: "authorization_code",
        code_verifier: String(code_verifier),
      }),
    });

    const tokens = (await tokenRes.json()) as Record<string, any>;
    if (!tokenRes.ok) {
      console.error("[Token Exchange] Google error:", tokens);
      return res.status(400).json({
        error: tokens.error_description || tokens.error || "Token exchange failed",
      });
    }

    // Get user info from Google
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const userInfo = (await userRes.json()) as Record<string, any>;

    if (!userInfo.email) {
      return res.status(400).json({ error: "No email in Google user info" });
    }

    return res.status(200).json({
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      picture: userInfo.picture || null,
    });
  } catch (err: any) {
    console.error("[Token Exchange] Error:", err);
    return res.status(500).json({ error: err.message || "Token exchange failed" });
  }
}
