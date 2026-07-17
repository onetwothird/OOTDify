# OOTDify

Project README

New feature scaffolding added:

- src/features/closet: types, scanner stub
- src/features/outfit: generator, compatibility scoring
- src/features/weather: simple service with optional OpenWeather usage
- src/features/analytics: most/least worn and wear timeline helpers
- src/features/history: outfit history backed by localStorage
- src/features/search: simple closet search
- src/store/wardrobeStore.ts: localStorage-backed wardrobe store
- src/components: small UI skeletons for scanner and outfit card

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

## 📁 Project Structure

```text
OOTDify/
├── app.json
├── package.json
├── tsconfig.json
├── assets/
├── src/
│   ├── app/                    # Expo Router screens and layouts
│   │   ├── (auth)/
│   │   ├── (tabs)/
│   │   ├── outfit/
│   │   ├── _layout.tsx
│   │   └── +not-found.tsx
│   ├── features/
│   │   └── wardrobe/           # Wardrobe-specific feature modules
│   │       ├── components/
│   │       ├── services/
│   │       ├── store/
│   │       └── types/
│   ├── hooks/
│   ├── shared/
│   │   ├── config/
│   │   ├── lib/
│   │   └── ui/
│   ├── styles/
│   ├── utils/
│   └── global.css
```

## 🧠 Future Directions

- Vision-based clothing detection and background cleanup
- Multimodal AI styling with richer outfit reasoning
- Personalized recommendations based on wardrobe history and preferences
- Smarter itinerary planning tied to weather, location, and schedule
