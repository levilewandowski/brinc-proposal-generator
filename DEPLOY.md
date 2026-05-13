# Brinc Proposal Generator — Vercel Deployment Guide

## Prerequisites

- [Vercel account](https://vercel.com) (free tier works)
- [GitHub account](https://github.com)
- Your Google Cloud OAuth credentials (already configured)

## Step 1: Push to GitHub

1. Create a new private repo on GitHub (e.g., `brinc-proposal-generator`)
2. Push this project:

```bash
git init
git add .
git commit -m "Initial"
git remote add origin https://github.com/YOUR_USERNAME/brinc-proposal-generator.git
git push -u origin main
```

## Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and log in
2. Click **"Add New..." → "Project"**
3. Import your GitHub repo
4. Vercel auto-detects Vite — keep default settings

## Step 3: Environment Variables

In Vercel dashboard → Project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `DATABASE_URL` | `mysql://4KGpG4SauNqUAwP.root:kj5KKKTGoXPKZ0hPHd4sCgKwzuNAyDtM@ep-t4ni387b5e83b7519dc8.epsrv-t4n281l4mrmemi4zls9a.ap-southeast-1.privatelink.aliyuncs.com:4000/19e180f6-7ad2-89c2-8000-09ac87bffb88` |
| `VITE_GOOGLE_CLIENT_ID` | `711074142580-2lh3uth8dn38hjmoth12roi8uomdaak2.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `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` |
| `GOOGLE_DRIVE_FOLDER_ID` | `1anXSVrvuSD1ZBU5dnvQbyPJTElddNKm0` |
| `PUBLIC_APP_URL` | `https://your-vercel-url.vercel.app` |

> Replace `PUBLIC_APP_URL` with your actual Vercel URL after first deploy.

## Step 4: Update Google Cloud Console

Add your Vercel URL to **Authorized redirect URIs**:
```
https://your-vercel-url.vercel.app/api/google/callback
```

## Step 5: Deploy

Click **Deploy** in Vercel. Should be live in ~1 minute.

## Step 6: Seed the Database (first time only)

After deploy, run this locally to seed the 167 slides:

```bash
DATABASE_URL=mysql://... npx tsx scripts/seed-slides.ts
```

Or connect to the MySQL DB directly and import the seed data.

## Architecture on Vercel

```
Frontend (Static)
  /              → React app (Vite build)
  /#/library     → Slide Library
  /#/proposal/:id→ Proposal Preview

Backend (Serverless)
  /api/health    → Health check
  /api/google/callback → OAuth callback
  /api/google/save     → Save tokens
  /api/trpc/*    → tRPC API (proposals, slides, google, converter)
```
