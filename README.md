# 🧥 OOTDify

OOTDify is a mobile-first **AI fashion assistant** built with Expo (React Native)
and a Flask AI backend. It helps you build a private wardrobe, generate outfit
ideas, run virtual try-ons, and keep your photos secure.

> Privacy-first by design: wardrobe images and body photos are stored in
> **private, per-user** storage buckets and are only ever shown to the owner
> via short-lived signed URLs. No fake data — every screen renders real rows,
> and failures are honest and clearly explained.

## ✨ Features

- **Wardrobe** — add clothes by photo, tag category/color/size/brand/style/
  season/occasion, search, filter, favorite, edit, and delete. Multiple photo
  uploads with per-image success/failure reporting.
- **AI styling** — image analysis (detection, pose, segmentation) and
  server-side outfit recommendations over the real catalog.
- **Virtual try-on** — 5-step workflow (Photo → Clothing → Generate → Review →
  Save) with an honest "model not configured" state until a real VTON model is
  provided server-side.
- **Outfit builder** — compose outfits from your wardrobe + catalog, save looks,
  and get compatibility scoring.
- **Profile & preferences** — first/last name, avatar, favorite styles, colors,
  sizes, occasions; privacy & data controls (export, clear, delete account).
- **Shopping integration architecture** — a runtime provider registry for
  Shopee/TikTok Shop etc. Nothing is scraped; providers plug in through one
  interface with honest "not configured" messaging until one exists.

## 🛠️ Tech Stack

- [Expo SDK 57](https://docs.expo.dev/versions/v56.0.0/) + React Native + [Expo Router](https://docs.expo.dev/router/introduction/)
- [TypeScript](https://www.typescriptlang.org/) + [Zustand](https://github.com/pmndrs/zustand)
- [Supabase](https://supabase.com/) — Auth, Postgres (RLS), and private Storage
- [Flask](https://flask.palletsprojects.com/) AI backend + [Ultralytics YOLO](https://docs.ultralytics.com/) (detection / pose / segmentation)
- [Reanimated](https://docs.swmansion.com/react-native-reanimated/) + `expo-image` for smooth UI

```
Expo app (Expo Go / device)  ──HTTP──▶  Flask backend (:5000)
        │                                   │
        └──────────▶ Supabase (Auth + DB + Storage)  ◀── service-role client (backend only)
```

## 📁 Repository Layout

```text
OOTDify/
├── src/                     # Expo Router app
│   ├── app/                 #   routes only: (auth), (tabs), catalog, item, outfit, privacy
│   ├── features/            #   capture, clothing, shopping, tryon, wardrobe, outfit, history
│   ├── services/            #   apiClient (error-aware), aiApi (typed backend client)
│   └── shared/              #   components, config (theme, api), hooks, lib (supabase)
├── backend/                 # Flask AI backend (app.py, routes/, services/, models/, tests/)
├── supabase/schema.sql      # full DB schema: tables, RLS, storage buckets, seed catalog
├── docker-compose.yml       # optional backend container (see Docker section)
└── .env.local               # Expo public env (gitignored) — copy from .env.example
```

## 🚀 Getting Started

### 0. Prerequisites

- Node 20+ and npm
- Python 3.12
- A Supabase project (free tier is fine)
- Expo Go on your phone (or an emulator) for device testing

### 1. Apply the Supabase schema (once)

The app relies on tables **and storage buckets** that live in
`supabase/schema.sql`. This must be applied to your Supabase project or features
fail with errors like `storageApiError: bucket not found`.

1. Open your Supabase project → **SQL Editor** → paste the contents of
   `supabase/schema.sql` → **Run**. The script is idempotent (safe to re-run).
2. It creates: all tables + RLS policies, the private storage buckets
   (`users`, `wardrobe`, `tryons`, `avatars`) and the public `clothing` bucket,
   storage object policies, and a small seed catalog.

If you later see `bucket not found`, the schema was not applied (or was applied
before the storage section existed) — re-run `supabase/schema.sql`.

### 2. Configure environment files

Only **public** keys go into Expo. Private credentials live in
`backend/.env` only.

**Expo** — copy `.env.example` → `.env.local`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
# Flask backend URL — your PC's LAN IP when testing on a real phone:
EXPO_PUBLIC_API_URL=http://192.168.1.50:5000
```

For the API URL: physical phone → your PC's LAN IPv4 (`ipconfig`); Android
emulator → `http://10.0.2.2:5000`; iOS simulator / web → `http://localhost:5000`.
If `EXPO_PUBLIC_API_URL` is left unset on a phone, the app derives the LAN host
from Metro automatically.

**Backend** — copy `backend/.env.example` → `backend/.env` and fill in:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # NEVER in EXPO_PUBLIC_*
TRYON_MODEL_PATH=                                  # optional VTON weights
```

### 3. Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1          # Windows — or: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Verify connectivity (Terminal 1 stays running):

```bash
Invoke-WebRequest http://127.0.0.1:5000/health     # PowerShell
# => {"status":"ok","service":"ootdify-ai","version":"1.0.0","model_loaded":true}
```

### 4. Run the app

```bash
npx expo start
```

Scan the QR code in Expo Go (phone and PC must be on the same Wi-Fi). Press
`i` / `a` for simulators, `w` for web.

### 5. One command for everything (recommended)

Instead of running the backend and Expo in separate terminals, kick off both
from the repo root:

```bash
npm run dev
```

This launches the Flask backend (`backend/app.py`, reusing `backend/.venv` if
present) and `npx expo start` side by side, with `[backend]` / `[expo]`
prefixed logs. `Ctrl+C` shuts both down.

- `npm run backend` — backend only
- `npm run expo` — Expo only
- `npm run dev` — both (default)

## 🐳 Docker (optional)

A `Dockerfile` (in `backend/`) and `docker-compose.yml` are provided for anyone
who prefers the backend in a container. **Not required** — the venv flow above
is the primary path.

```bash
# from the repo root, with backend/.env optionally configured first
docker compose up --build

# verify
Invoke-WebRequest http://127.0.0.1:5000/health
```

Notes:

- `env_file` is optional: without it the app boots and `/health` works, while
  Supabase-backed routes pause gracefully ("Supabase not configured").
- `uploads/`, `outputs/`, `data/`, and `models/` are volume-mounted so model
  weights (auto-downloaded on first boot) and job data persist across restarts.

## 🔐 Google Sign-In Setup

The Google button (`src/shared/lib/googleAuth.ts`) uses browser-based OAuth
through Supabase — no native Google SDK config (Info.plist / SHA-1 fingerprints)
is required. For it to complete, the **server side** must be set up:

1. **Supabase Dashboard → Authentication → Providers → Google**: enable the
   provider and paste the OAuth Client ID(s) and Client Secret from the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:
   add `ootdify://` (the redirect URI this app produces natively; the exact
   value is logged during development).
3. **Google Cloud Console → Credentials**: create an OAuth client; under
   *Authorized redirect URIs* add your Supabase project's callback URL.

The flow handles implicit tokens and PKCE (`code` → `exchangeCodeForSession`),
then the root layout routes to the app once `onAuthStateChange` reports a session.

## 🧪 Verification

```bash
npx tsc --noEmit          # TypeScript
npm test                  # Jest (outfit generator + compatibility)
cd backend && .\.venv\Scripts\python.exe -m pytest -q
npx expo-doctor           # project health
npx expo export -p web    # static web export (sanitizes build)
```

## 🔒 Security Notes

- **No private keys in the client.** Only `EXPO_PUBLIC_*` variables exist in
  the Expo bundle; the service-role key lives in `backend/.env` exclusively.
- Identity is derived from the validated Supabase **session token** server-side —
  the client never sends a `user_id`.
- Storage buckets are private; the backend hands out short-lived signed URLs.
- Storage RLS/object policies enforce `auth.uid() = owner_id` for every
  user-owned bucket.

## 🧠 Future Directions

- Plug a real virtual-try-on model into `backend/services/tryon_service.py`.
- Register Shopee / TikTok Shop providers in `src/features/shopping/`.
- Model-based outfit scoring behind the existing `/api/recommend` contract.