---
paths:
  - "src/**/*.{ts,tsx}"
---

# Frontend (Expo app)

- **Theme:** style through `makeStyles((theme) => …)` / `useAppTheme()`. Theme
  colours are 6-digit hex (enforced by `theme.test.ts`); blend tints onto their
  background instead of `rgba(...)`. In dark mode `primary` is near-white, so on
  a `primary` fill use `onPrimary` / `onPrimaryMuted` / `onPrimarySubtle` /
  `onPrimaryFaint`, never hard-coded white. Only chrome drawn over a camera feed
  may use fixed `#FFFFFF` / `#000000`.
- **Strings:** every user-visible string goes through `useT()`. Add each key to
  both `src/shared/i18n/en.ts` and `fil.ts` (`fil` is typed against `en`, so
  `tsc` fails if one is missing).
- **New routes:** typed routes regenerate only when the dev server runs. Until
  then `tsc` rejects the new path. Run `CI=1 npx expo start` until
  `.expo/types/router.d.ts` contains it, then stop the server.
- **React Compiler lint (`react-hooks/refs`):** never read `ref.current` during
  render. Create animated values with `useState(() => new Animated.Value(x))`,
  and keep "last value" state with state, not refs.
- **Animation:** existing screens use React Native `Animated`, not Reanimated.
- **Uploads:** shrink photos with `shrinkForUpload()` before sending. Storage
  uploads go through `formFile()` (RN `FormData` quirk; see its header).
