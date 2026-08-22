# Ludo Legend — Vercel deployment

This repository is configured to deploy from the **repository root**.

## Vercel project settings

- Root Directory: `.` (repository root)
- Framework Preset: Vite (or Other)
- Build Command: leave the project setting blank so `vercel.json` is used
- Output Directory: leave blank so `vercel.json` is used
- Install Command: leave blank so `vercel.json` is used

The root `vercel.json` builds the API first, builds the Vite frontend, deploys `/api/[...path].ts` as the serverless API, and sends only non-API routes to the SPA.

## Required Vercel environment variables

Set these in **Settings → Environment Variables** for Production (and Preview if desired):

```text
DATABASE_URL=<your MongoDB Atlas connection string>
GOOGLE_CLIENT_ID=<your Google OAuth Web client ID>
JWT_SECRET=<long random secret>
CORS_ORIGIN=https://ludo-legend.vercel.app
VITE_GOOGLE_CLIENT_ID=<the same Google OAuth Web client ID>
VITE_API_URL=
```

`VITE_API_URL` must stay empty for this deployment because the API is same-origin under `/api`.

## Google Cloud OAuth

In the Google OAuth Web client, add:

- Authorized JavaScript origin: `https://ludo-legend.vercel.app`

If you use a custom domain, add that domain too.

## Test after deployment

Open these URLs directly:

- `/api/healthz` → JSON `{ "status": "ok" }`
- `/api/auth/me` while logged out → JSON `401` response

If either URL returns the Ludo HTML page, the Vercel project Root Directory is not the repository root.

## Security

Do not commit `.env` files. This fixed package intentionally excludes local `.env` files and keeps only `.env.example` templates.
