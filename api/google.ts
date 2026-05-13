import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { googleCredentials } from "../db/schema";
import { eq, desc } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

function getRedirectUri(req: Request) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/google/callback`;
}

export const googleRouter = createRouter({
  getAuthUrl: publicQuery.query(async ({ ctx }) => {
    const redirectUri = getRedirectUri(ctx.req);
    const scopes = encodeURIComponent(
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/presentations"
    );
    const state = Buffer.from(
      JSON.stringify({ redirectUri, ts: Date.now() })
    ).toString("base64url");

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scopes}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${state}`;

    return { authUrl: url };
  }),

  handleCallback: publicQuery
    .input(z.object({ code: z.string(), state: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const redirectUri = getRedirectUri(ctx.req);

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: input.code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = (await tokenRes.json()) as Record<string, any>;
      if (!tokenRes.ok) {
        throw new Error(tokens.error_description || "OAuth failed");
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

      return { email: String(userInfo.email), connected: true };
    }),

  getStoredCredentials: publicQuery
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const results = await db
        .select()
        .from(googleCredentials)
        .where(eq(googleCredentials.userIdentifier, input.email))
        .orderBy(desc(googleCredentials.createdAt))
        .limit(1);
      return results[0] || null;
    }),

  listStoredAccounts: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select({
        id: googleCredentials.id,
        userIdentifier: googleCredentials.userIdentifier,
        createdAt: googleCredentials.createdAt,
      })
      .from(googleCredentials)
      .orderBy(desc(googleCredentials.createdAt));
  }),

  uploadToDrive: publicQuery
    .input(
      z.object({
        email: z.string(),
        fileName: z.string(),
        base64Data: z.string(),
        mimeType: z.string().default("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const creds = await db
        .select()
        .from(googleCredentials)
        .where(eq(googleCredentials.userIdentifier, input.email))
        .orderBy(desc(googleCredentials.createdAt))
        .limit(1);

      if (!creds[0]) throw new Error("No Google credentials found");

      let accessToken = creds[0].accessToken;

      // Refresh if expired
      if (creds[0].expiresAt && new Date(creds[0].expiresAt) < new Date()) {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: creds[0].refreshToken || "",
            grant_type: "refresh_token",
          }),
        });
        const refreshData = (await refreshRes.json()) as Record<string, any>;
        if (refreshData.access_token) {
          accessToken = String(refreshData.access_token);
          await db
            .update(googleCredentials)
            .set({
              accessToken: String(refreshData.access_token),
              expiresAt: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000),
            })
            .where(eq(googleCredentials.id, creds[0].id));
        }
      }

      // Create file metadata
      const metadata = {
        name: input.fileName,
        mimeType: "application/vnd.google-apps.presentation",
        parents: DRIVE_FOLDER_ID ? [DRIVE_FOLDER_ID] : undefined,
      };

      // Multipart upload
      const boundary = "-------314159265358979323846";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartBody =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: " + input.mimeType + "\r\n" +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        input.base64Data +
        closeDelim;

      const uploadRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary="${boundary}"`,
          },
          body: multipartBody,
        }
      );

      const uploadData = (await uploadRes.json()) as Record<string, any>;
      if (!uploadRes.ok) {
        throw new Error(uploadData.error?.message || "Upload failed");
      }

      // Make it editable
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "writer", type: "anyone" }),
        }
      );

      return {
        fileId: String(uploadData.id),
        webViewLink: `https://docs.google.com/presentation/d/${uploadData.id}/edit`,
      };
    }),
});
