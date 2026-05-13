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