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
