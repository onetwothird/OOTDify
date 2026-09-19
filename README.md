# OOTDify

Project README

New feature scaffolding added:

- features/closet: canonical `ClothingItem` type + scanner stub
- features/outfit: generator, compatibility scoring, `Outfit` type + tests
- features/weather: simple service with optional OpenWeather usage
- features/history: outfit history backed by localStorage
- features/search: simple closet search
- features/wardrobe/store.ts: the single wardrobe store (zustand)
- shared/components: small UI skeletons (Button, GlassCard)

Next steps:

- Wire UI pages to these services where appropriate (upload photos, call `scanImages`)
- Replace stubs with actual ML / API integrations (vision model, weather API key)
- Add tests and type refinements

Quick run & test notes:

- Start app: `npx expo start -c`
- Run unit tests (after installing dev deps):

```bash
npm install
npm test
```

Optional environment variables:

- `OPENWEATHER_API_KEY` — set to use real weather data in `getWeatherForLocation`.
- `CLOSET_SCANNER_API_URL` — POST images to this URL (JSON body `{ images: [...] }`) to use an external scanner API. If not set, local stub is used.

# 🧥 OOTDify

OOTDify is a mobile-first AI styling app built with Expo and React Native. It helps users manage a wardrobe, generate outfit ideas, plan looks for special occasions, and explore a polished, minimalist fashion experience.

## ✨ Features

- Digital wardrobe experience with visual item cards and categories
- AI-inspired outfit suggestions for daily styling
- Outfit planning for dates, occasions, and travel
- Swipe-based outfit feedback and selection flow
- Clean editorial UI with shared design tokens and reusable components

## 🛠️ Tech Stack

- [Expo](https://expo.dev/) and React Native
- [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation
- [TypeScript](https://www.typescriptlang.org/) for typed app logic
- [Zustand](https://github.com/pmndrs/zustand) for lightweight state management
- [Supabase](https://supabase.com/) for authentication and backend data
- [React Native Calendars](https://github.com/wix/react-native-calendars) for planning views
- [@expo/vector-icons](https://docs.expo.dev/guides/icons/) for UI icons

## 🚀 Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file with your Supabase and weather keys:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
EXPO_PUBLIC_WEATHER_API_KEY=your-openweather-key
```

3. Start the app:

```bash
npx expo start
```

4. Open the Expo QR code in Expo Go on your device, or press `i` / `a` for the simulator.

## 🔐 Google Sign-In Setup

The Google button (`src/shared/lib/googleAuth.ts`) uses browser-based OAuth
through Supabase — no native Google SDK config (Info.plist / SHA-1 fingerprints)
is required. For it to actually complete, the **server side** must be set up:

1. **Supabase Dashboard → Authentication → Providers → Google**: enable the
   provider and paste the OAuth Client ID(s) and Client Secret from the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:
   add `ootdify://` (the redirect URI this app produces on native via its
   `ootdify` scheme; the exact value is logged by the flow in development if
   you need to confirm it). Web builds use the site URL instead of `ootdify://`.
3. **Google Cloud Console → Credentials**: create an OAuth client for the app;
   under *Authorized redirect URIs* add your Supabase project's callback URL
   (shown on the Google provider page in the Supabase dashboard).

The flow handles both implicit tokens (`access_token`/`refresh_token`) and
PKCE (`code` → `exchangeCodeForSession`), then lets the root layout route to
the app once `onAuthStateChange` reports a session.

## 📁 Project Structure

Everything lives in `src/`. Two top-level buckets only — code either belongs to a
**feature** (it is only used by that screen/flow) or it is genuinely **shared**
across the whole app. If you're looking for something, start from the feature name.

```text
OOTDify/
├── app.json
├── package.json
├── tsconfig.json
├── assets/                     # static images / icons
├── scripts/                    # one-off CLI scripts (reset-project)
├── src/
│   ├── app/                    # Expo Router screens & layouts (routes only)
│   │   ├── (auth)/             #   landing, login, signup, forgot-password
│   │   ├── (tabs)/             #   home, AI outfits, calendar, wardrobe, + FAB
│   │   ├── outfit/[id].tsx     #   Fit Breakdown screen
│   │   ├── _layout.tsx
│   │   └── +not-found.tsx
│   ├── features/               # each feature owns its components + logic
│   │   ├── capture/            #   "Add to Wardrobe" modal + its UI store
│   │   ├── closet/             #   ClothingItem type (canonical) + scanner
│   │   ├── history/            #   outfit history (localStorage-backed)
│   │   ├── outfit/             #   generator, compatibility, Outfit type, tests
│   │   ├── search/             #   closet search helper
│   │   ├── wardrobe/           #   single wardrobe store (useWardrobeStore /
│   │   │                       #   WardrobeStore), SwipeableLook, ItemGrid
│   │   └── weather/            #   optional OpenWeather service
│   └── shared/                 # app-wide code only
│       ├── components/         #   Button, GlassCard
│       ├── config/             #   theme tokens
│       ├── lib/                #   supabase client (single instance)
│       ├── styles/             #   global.css (web)
│       └── utils/              #   formatters, image helpers
```

**Conventions that keep it readable**

- One store per feature: `features/wardrobe/store.ts` holds the single
  `useWardrobeStore` / `WardrobeStore` pair — there is no second store anywhere.
- One canonical `ClothingItem` type in `features/closet/types.ts`; the other
  features import it from there.
- `src/app/` only ever contains route files; every screen imports its building
  blocks from `features/` or `shared/`.

**Intentional dead code** (kept as reference, not wired to any screen):
`shared/components/Button.tsx`, `features/outfit/components/OutfitCard.tsx`,
`features/wardrobe/components/ItemGrid.tsx`, `features/wardrobe/services/stylist.ts`,
`features/weather/*`. Delete or wire them up whenever convenient.

## 🧠 Future Directions

- Vision-based clothing detection and background cleanup
- Multimodal AI styling with richer outfit reasoning
- Personalized recommendations based on wardrobe history and preferences
- Smarter itinerary planning tied to weather, location, and schedule
