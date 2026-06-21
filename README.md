# 🧥 OOTDify - AI Clothing Stylist

OOTDify is a next-generation AI styling application built for Gen Z and young adults. It acts as a personal pocket stylist by digitizing a user's wardrobe and using AI to curate daily looks, plan weekly itineraries, and recommend essential missing pieces.

## ✨ Features

* **The Closet (Vault):** A digital, visual inventory of all uploaded clothing items, automatically categorized and tagged by "vibe".
* **AI Outfit Generation:** Instantly draft daily outfits with a visually stunning, overlapping moodboard canvas.
* **Outfit Itinerary Planner:** Plan outfits for specific dates, locations (City/Country), and occasions (Casual, Work, Dinner, Evening).
* **Interactive Styling:** Reject AI suggestions with "Not a Match" or manually edit combinations.
* **Minimalist UI:** A clean, editorial, light-mode interface featuring a custom floating action button (FAB) cutout.

## 🛠️ Tech Stack

* **Framework:** [Expo](https://expo.dev/) & React Native
* **Navigation:** Expo Router (File-based routing)
* **State Management:** [Zustand](https://github.com/pmndrs/zustand) (Lightweight global state)
* **Icons:** `@expo/vector-icons` (Ionicons & MaterialCommunityIcons)
* **Styling:** Custom StyleSheet design system with centralized tokens.

## 🚀 Getting Started

1. **Install dependencies**
   Make sure you are in the root directory of the project, then run:
   ```bash
   npm install
   npm install zustand @expo/vector-icons

2. **Start the app**
   ```bash
    npx expo start
   
3. **In the terminal output, scan the QR code with the Expo Go app on your physical device (iOS/Android), or press i to open in an iOS Simulator / a for an Android Emulator.**

## 📁 Folder Structure 
This project uses a scalable src/ directory architecture alongside Expo Router:

```bash
/
├── app/                      # Expo Router (File-based routing)
│   ├── (tabs)/               # Bottom navigation screens
│   │   ├── _layout.tsx       # Tab bar configuration
│   │   ├── index.tsx         # Home (Today's AI outfit suggestion)
│   │   ├── wardrobe.tsx      # The digital closet (Grid of items)
│   │   └── planner.tsx       # Weekly lookbook & missing items
│   ├── outfit/               # Nested route for outfit details
│   │   └── [id].tsx          # Dynamic route for specific generated looks
│   ├── _layout.tsx           # Root layout (Auth providers, Toast notifications)
│   └── +not-found.tsx        
├── src/                      # All underlying logic and UI
│   ├── components/           # Reusable frontend pieces
│   │   ├── ui/               # Generic elements
│   │   │   ├── Button.tsx    
│   │   │   └── GlassCard.tsx # Minimalistic frosted glass containers for outfits
│   │   └── stylist/          # Domain-specific elements
│   │       ├── ItemGrid.tsx  
│   │       └── SwipeableLook.tsx
│   ├── services/             # The "Brain" of the app
│   │   ├── api/              # Database calls (e.g., Firebase or Supabase)
│   │   ├── ai/               # LLM prompts for styling and outfit generation
│   │   └── vision/           # Image uploading, background removal, and cropping
│   ├── store/                # Global state (Zustand is highly recommended here)
│   │   └── wardrobeStore.ts  # Caches uploaded clothes so the app feels instant
│   ├── constants/            # Hardcoded configurations
│   │   ├── theme.ts          # Color palettes (e.g., defining primary: '#8B5CF6')
│   │   └── prompts.ts        # Base instructions fed to the AI
│   ├── types/                # TypeScript interfaces
│   │   └── index.ts          # e.g., define the `ClothingItem` and `Outfit` types
│   └── utils/                # Helper functions
│       ├── formatters.ts
│       └── imageHelpers.ts   # Resizing images before sending to the AI
├── assets/                   # Local fonts, splash screens, and icons
│   ├── images/
│   └── fonts/
├── app.json                  # Expo configuration
├── package.json
└── tsconfig.json
```

## 🧠 Future AI Integrations

* **Vision/Segmentation:** YOLOv11 (or similar) to isolate clothing items from messy background mirror selfies.
* **Embeddings:** FashionCLIP to convert clothing images into semantic style vectors.
* ***Reasoning:** Multimodal LLM (Gemini 1.5 Pro / GPT-4o) to evaluate vectors, apply styling logic, and generate outfit combinations. Designed and built with Expo.
