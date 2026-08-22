# Ludo Legend

A real-time multiplayer Ludo game — online rooms (with mixed-device seating
and bots), offline pass-and-play, and a global leaderboard.

Monorepo layout (pnpm workspaces):

```
artifacts/
  ludo-game/    React + Vite frontend (the game itself)
  api-server/   Express API backend (polling-based multiplayer, no WebSockets)
lib/
  db/                 MongoDB models (Mongoose)
  api-spec/           OpenAPI spec (source of truth for the HTTP API)
  api-client-react/   Generated React Query hooks (from api-spec)
  api-zod/            Generated Zod validators (from api-spec)
scripts/              Misc repo scripts
docker-compose.yml    Local MongoDB for development
```

## 1. Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 9+ (`npm i -g pnpm`)
- [Docker](https://www.docker.com/) (only needed if you don't already have a
  local MongoDB running — see below)

> **Windows users:** everything here works in plain PowerShell/cmd — no
> WSL or Git Bash required. All scripts are cross-platform.

## 2. First-time setup

The `.env` files are already included and pre-configured to connect to a
MongoDB running locally at `mongodb://127.0.0.1:27017/ludo-legend` — if
that matches your setup, you can skip straight to `pnpm install` and
`pnpm run dev` (step 3). No Docker/`db:up` step is required if you already
have MongoDB running.

```bash
# 1. Install dependencies
pnpm install

# 2. (Optional) Only if you DON'T already have MongoDB running locally —
#    starts one via Docker instead:
pnpm run db:up

# 3. Confirm the API server can reach MongoDB
pnpm run db:ping
```

You should see `✅ Connected to MongoDB successfully.` If it fails, check
`artifacts/api-server/.env` and `lib/db/.env` — both hold the
`DATABASE_URL` (edit either if your MongoDB uses a different host, port,
database name, or requires auth).

No schema migration step is needed — MongoDB is schemaless, and collections
are created automatically the first time data is written.

## 3. Run it locally (development)

From the repo root:

```bash
pnpm run dev
```

This starts both services together:
- **API server** on `http://localhost:4000`
- **Frontend (Vite dev server)** on `http://localhost:5173`, which proxies
  `/api` and `/ws` requests to the API server automatically — no CORS setup
  needed.

Open **http://localhost:5173** in your browser and play. Open it in a
second browser tab/window (or another device on the same network) to test
multiplayer — create a room, share the code, and join from the other tab.

To test the "multiple players from one device" lobby feature: in the room
lobby, tap **"Add Player from This Device"** to seat 2-3 local players from
the same browser tab, while another tab/device joins with the remaining
seat(s) (e.g. 3+1, 2+2).

### Running each service individually

```bash
pnpm --filter @workspace/api-server run dev   # API only
pnpm --filter @workspace/ludo-game run dev    # frontend only
```

## 4. Testing / verifying the build

```bash
# Type-check everything
pnpm run typecheck

# Full production build (type-check + build every package)
pnpm run build
```

`pnpm run build` should complete with no errors and produce:
- `artifacts/api-server/dist/index.mjs` — the bundled backend
- `artifacts/ludo-game/dist/public/` — the built frontend static files

## 5. Deploying / running in "production mode" on your laptop

The API server can serve the built frontend itself, so the entire app runs
as a **single process on a single port** — no separate frontend server or
proxy needed:

```bash
pnpm run start
```

This runs `pnpm run build` followed by the API server, which detects the
built frontend at `artifacts/ludo-game/dist/public` and serves it directly
alongside the API. Open **http://localhost:4000** (or
whatever `PORT` is set to in `artifacts/api-server/.env`).

Make sure MongoDB is running first (`pnpm run db:up`) and that
`artifacts/api-server/.env` has a valid `DATABASE_URL`.

### Stopping / resetting the local database

```bash
pnpm run db:down          # stop the MongoDB container (keeps data)
docker compose down -v    # stop AND delete the local database volume
```

## 6. Environment variables

| File | Variable | Purpose | Local default |
|---|---|---|---|
| `artifacts/api-server/.env` | `PORT` | API port | `4000` |
| `artifacts/api-server/.env` | `DATABASE_URL` | MongoDB connection string | `mongodb://127.0.0.1:27017/ludo-legend` |
| `artifacts/ludo-game/.env` | `PORT` | Vite dev server port | `5173` |
| `artifacts/ludo-game/.env` | `API_PORT` | API port the dev proxy targets | `4000` |
| `artifacts/ludo-game/.env` | `BASE_PATH` | App base path | `/` |
| `artifacts/api-server/.env` | `GOOGLE_CLIENT_ID` | Google OAuth client ID — see §7 below | *(empty — sign-in disabled until set)* |
| `artifacts/api-server/.env` | `JWT_SECRET` | Signs the login session cookie | Insecure dev default — **set a real value before deploying** |
| `artifacts/ludo-game/.env` | `VITE_GOOGLE_CLIENT_ID` | Same Google client ID, used by the browser | *(empty)* |
| `artifacts/ludo-game/.env` | `VITE_API_URL` | Only needed if you ever split the frontend and API across two hosts again — leave empty for the single-Vercel-project setup in §8 | *(empty — same-origin)* |
| `artifacts/api-server/.env` | `CORS_ORIGIN` | Same — only relevant for a split-host deploy, not the single-Vercel-project setup in §8 | *(empty — reflects any origin, fine for local dev)* |

## 7. Setting up Google Sign-In

Guests can already play fully offline/online without any setup — this step
is only needed to enable the "Sign in with Google" button.

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create (or reuse) a project, then **Create Credentials → OAuth client ID →
   Web application**.
2. Under **Authorized JavaScript origins**, add the URL(s) you'll run the app
   from, e.g. `http://localhost:5173` for local dev.
3. Copy the generated **Client ID** (you don't need the client secret — this
   app uses Google Identity Services' ID-token flow, verified server-side).
4. Paste it into **both**:
   - `artifacts/api-server/.env` → `GOOGLE_CLIENT_ID=...`
   - `artifacts/ludo-game/.env` → `VITE_GOOGLE_CLIENT_ID=...`
5. Set a real `JWT_SECRET` in `artifacts/api-server/.env` (any long random
   string) before deploying anywhere public.
6. Restart both dev servers. The Google button appears automatically once a
   client ID is configured (top-left of the home screen, and on the
   Profile/Leaderboard pages).

**How the two play modes work under the hood:**
- **Guests** never touch MongoDB — their profile, stats, and in-progress
  match all live in `localStorage` on that browser only.
- **Google accounts** are upserted by `googleId` (falling back to `email`)
  so signing in again always resumes the same account instead of creating a
  duplicate. Profile edits, stats, and the in-progress match snapshot are
  all persisted to MongoDB, so they follow the account across devices.
- The Leaderboard is locked for guests (login-gated both in the UI and on
  the `/api/leaderboard*` endpoints) since it only makes sense for
  persistent, deduplicated accounts.

## 8. Deploying — everything on Vercel

Real-time multiplayer now runs on HTTP polling instead of Socket.IO (see
`artifacts/api-server/src/lib/room-engine.ts`) — the client asks
`GET /api/rooms/:code/state` for what's changed roughly every 1.3 seconds,
and that same endpoint is what lazily resolves bot turns and turn-timeouts
(based on elapsed time, not a background timer). Because there's no
persistent connection and no in-memory state to keep alive between
requests, the **entire app — frontend and API — now deploys as a single
Vercel project**, no separate backend host needed.

You'll still want a cloud database, since Vercel's functions don't have a
local disk to run MongoDB on:

- **MongoDB → [MongoDB Atlas](https://www.mongodb.com/atlas)**, free forever
  on the M0 tier. Create a cluster, create a database user, and grab the
  connection string (`Connect → Drivers`) — it looks like
  `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/ludo-legend`.
  Under **Network Access**, allow `0.0.0.0/0` (Vercel's functions run from
  rotating IPs, so you can't allowlist a fixed one).

### 8.1 Import the project

1. Push this repo to GitHub if it isn't already.
2. In the [Vercel dashboard](https://vercel.com/new), import the repo.
3. Set **Root Directory** to `artifacts/ludo-game`. The included
   `vercel.json` already has the right build/output/install commands and an
   SPA rewrite that excludes `/api/*` (so client-side routes like
   `/profile` don't 404 on refresh, without breaking the API) — Vercel
   picks this up automatically once the root directory is set.
4. A serverless function is auto-detected from
   `artifacts/ludo-game/api/[...path].ts` — this one file mounts the whole
   API (auth, players, rooms, leaderboard) as a single function; nothing
   else to configure for it.

### 8.2 Environment variables

Add these in the Vercel project's **Settings → Environment Variables**
(apply to Production, and Preview/Development too if you want preview
deployments to work):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your MongoDB Atlas connection string |
| `GOOGLE_CLIENT_ID` | Client ID from §7 |
| `JWT_SECRET` | A long random string (`openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `VITE_GOOGLE_CLIENT_ID` | Same client ID from §7 (yes, both — one's read by the API function, one's baked into the browser bundle at build time) |

You do **not** need `VITE_API_URL` or `CORS_ORIGIN` for this setup —
they're only for the (no-longer-necessary) split-host deployment. Leaving
them unset means the frontend calls `/api/...` on its own origin, which is
exactly right here since everything's one Vercel project.

### 8.3 Deploy and test

1. Deploy. Vercel gives you a URL like `https://ludo-legend.vercel.app`.
2. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   add that URL to **Authorized JavaScript origins** on your OAuth client
   (§7) — keep `http://localhost:5173` in the list too if you still want
   local dev to work.
3. Open the URL and test: guest play (offline and online/multiplayer),
   Google sign-in, and the leaderboard.

### 8.4 A couple of things worth knowing

- **Cold starts are fine here.** Unlike a Socket.IO server, there's no
  "warm connection" to lose — every poll is just a normal HTTP request, so
  Vercel's per-request serverless model fits this architecture naturally
  instead of fighting it.
- **Multiplayer feel:** moves/rolls you make yourself apply instantly (the
  action's own response updates your screen immediately); an opponent's
  move shows up on your next poll, so there's up to ~1.3s of lag seeing
  *their* moves. For a turn-based dice game this is essentially
  imperceptible in practice.
- **Custom domain later:** just add it to Google's Authorized JavaScript
  origins (§7) — no other config changes needed, since frontend and API
  share the same domain automatically.
- **Hobby plan limits:** Vercel's free Hobby tier is intended for personal/
  non-commercial use (see the earlier free-tier discussion) — plenty for
  this app's scale, and each poll request is a fast, simple DB read/write
  well within the 10-second function timeout.

## What's new in this version

- **Rooms clean themselves up automatically** — every `Room` document has an
  `expiresAt`, backed by a MongoDB TTL index (`lib/db/src/schema/rooms.ts`),
  so MongoDB itself deletes the document — no cron job, no manual cleanup.
  Cancelled/abandoned/finished rooms expire almost immediately; an active
  lobby or match keeps sliding its expiry forward on every action, and only
  expires if genuinely abandoned (nobody touches it for 24h).
- **Real-time multiplayer runs on HTTP polling now, not Socket.IO** —
  `artifacts/api-server/src/lib/room-engine.ts` replaced the old in-memory
  Socket.IO room-manager with MongoDB-backed state and a
  `GET /rooms/:code/state` endpoint the client polls (~1.3s). Bot turns and
  turn-timeouts are resolved lazily based on elapsed time instead of a
  background `setTimeout`. This is what makes the whole app deployable as a
  single Vercel project (§8) — no separate always-on backend host needed.
- **Google Sign-In + Guest mode** — see §7. Guests play entirely on
  localStorage; signed-in accounts get MongoDB-backed profiles, stats, and
  cross-device match resume, deduped by Google account.
- **Room Lobby redesign** — now matches the landing page's dark theme
  (gradient background, glass cards, color accents).
- **Multi-seat local joining** — one device can add several local players
  (pass-and-play style) into an online room, in any split across devices
  (e.g. 3 seats from one phone + 1 from another, or 2+2).
- **Smarter bots** — both offline and online bots now use a scoring
  heuristic (captures, safe squares, blockades, danger avoidance, home
  progress) instead of picking moves at random, with easy/medium/hard
  difficulty tiers.
- **MongoDB instead of Postgres** — the whole data layer now runs on
  MongoDB via Mongoose; no more Postgres/Drizzle dependency.
- **Cleaned up for local development** — removed Replit-only files, added
  Docker Compose for local MongoDB, `.env.example` files, a Vite dev proxy,
  and a single-process production mode for easy local deployment.
