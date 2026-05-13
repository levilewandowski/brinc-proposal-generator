import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { googleCredentials } from "../db/schema";
import { desc, eq } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Google OAuth callback handler
app.get("/api/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.json({ error: "OAuth denied: " + error }, 400);
  }
  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  const host = c.req.header("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/google/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = (await tokenRes.json()) as Record<string, any>;
    if (!tokenRes.ok) {
      return c.json({ error: tokens.error_description || "OAuth failed" }, 400);
    }

    // Get user info
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const userInfo = (await userRes.json()) as Record<string, any>;

    // Store tokens
    const db = getDb();
    await db.insert(googleCredentials).values({
      userIdentifier: String(userInfo.email),
      accessToken: String(tokens.access_token),
      refreshToken: String(tokens.refresh_token || ""),
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    });

    // Redirect to app with success
    return c.redirect(`/?google_connected=${encodeURIComponent(String(userInfo.email))}`);
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return c.json({ error: err.message }, 500);
  }
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
