import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { getDb } from "./queries/connection";
import { googleCredentials } from "../db/schema";

const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const app = new Hono().basePath("/api");

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Health check
app.get("/health", async (c) => {
  const checks: any = {
    env: {
      clientId: !!GOOGLE_CLIENT_ID,
      secret: !!GOOGLE_CLIENT_SECRET,
      publicUrl: process.env.PUBLIC_APP_URL || "not set",
      dbUrl: !!process.env.DATABASE_URL,
    },
  };

  try {
    const db = getDb();
    await db.execute("SELECT 1");
    checks.db = { ok: true };
  } catch (e: any) {
    checks.db = { ok: false, error: e.message };
  }

  return c.json(checks);
});

// Google OAuth callback
app.get("/google/callback", (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`/?google_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return c.redirect("/?google_error=no_code");
  }

  return c.redirect(`/?google_code=${encodeURIComponent(code)}`);
});

// Exchange OAuth code for tokens (server-side, with client_secret)
app.post("/google/token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { code, code_verifier, redirect_uri } = body;

  if (!code || !code_verifier) {
    return c.json({ error: "Missing code or code_verifier" }, 400);
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
      return c.json(
        { error: tokens.error_description || tokens.error || "Token exchange failed" },
        400
      );
    }

    // Get user info from Google
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const userInfo = (await userRes.json()) as Record<string, any>;

    if (!userInfo.email) {
      return c.json({ error: "No email in Google user info" }, 400);
    }

    // Store tokens in database
    try {
      const db = getDb();
      await db.insert(googleCredentials).values({
        userIdentifier: String(userInfo.email),
        accessToken: String(tokens.access_token),
        refreshToken: String(tokens.refresh_token || ""),
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      });
    } catch (dbErr: any) {
      console.error("[Token Exchange] DB save warning:", dbErr.message);
      // Non-fatal: still return tokens to frontend
    }

    return c.json({
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      picture: userInfo.picture || null,
    });
  } catch (err: any) {
    console.error("[Token Exchange] Error:", err);
    return c.json({ error: err.message || "Token exchange failed" }, 500);
  }
});

// Save tokens from browser (legacy, kept for compatibility)
app.post("/google/save", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { accessToken, refreshToken, expiresIn, email } = body;

  if (!accessToken || !email) {
    return c.json({ error: "Missing accessToken or email" }, 400);
  }

  try {
    const db = getDb();
    await db.insert(googleCredentials).values({
      userIdentifier: String(email),
      accessToken: String(accessToken),
      refreshToken: String(refreshToken || ""),
      expiresAt: new Date(Date.now() + (expiresIn || 3600) * 1000),
    });
    return c.json({ email, connected: true });
  } catch (e: any) {
    return c.json({ error: "Failed to save: " + e.message }, 500);
  }
});

// tRPC handler
app.use("/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

// Export for Vercel serverless
export default app;