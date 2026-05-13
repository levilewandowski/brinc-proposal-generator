import type { VercelRequest, VercelResponse } from "@vercel/node";

// Support both naming conventions (VITE_ prefix for frontend compat, plain for server-only)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// AbortController polyfill for Node 18
function abortableFetch(url: string, init: RequestInit & { timeout?: number }) {
  const timeout = init.timeout || 10000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Quick health/debug response for GET
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasClientId: !!GOOGLE_CLIENT_ID,
      clientIdPrefix: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.split("-")[0] : null,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, code_verifier, redirect_uri } = req.body || {};

  if (!code || !code_verifier) {
    return res.status(400).json({ error: "Missing code or code_verifier" });
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      error: "Server config missing: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set",
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    });
  }

  try {
    // Exchange code for tokens with Google (server-side, includes client_secret)
    const tokenRes = await abortableFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      timeout: 8000,
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
        details: tokens,
      });
    }

    // Get user info from Google
    const userRes = await abortableFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      method: "GET",
      timeout: 5000,
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
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
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Request to Google timed out" });
    }
    return res.status(500).json({ error: err.message || "Token exchange failed" });
  }
}
