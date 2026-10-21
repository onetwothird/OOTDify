// C:\OOTDify\src\shared\lib\setupBlobGlobal.ts
// Loaded first from index.js, before expo-router's entry runs.
//
// In SDK 57, FetchResponse.blob() falls back to React Native's Blob store —
// the response is copied into the native blob store and read back through
// base64 — and logs a one-time performance warning telling you to add
// `expo-blob`. The framework does not install that package as
// globalThis.Blob yet (it is an open TODO in the SDK source), so the warning
// only clears when the app does it itself: with expo-blob as the global,
// response blobs are produced directly by the native module.
//
// Why this is safe:
//   * expo-blob ships natively in Expo Go for SDK 57 (versioned docs), and
//     this project runs in Expo Go.
//   * Supabase storage uploads don't care about the blob flavour: expo's
//     winter fetch duck-types any body with `arrayBuffer` + `type` into raw
//     request bytes, so all three upload call sites behave identically.
//   * React Native installs its Blob global as a configurable property, so
//     redefining it after RN's own polyfill has run is allowed.
//   * The install itself is guarded: if redefinition is refused, React
//     Native's Blob stays in place and the app behaves exactly as before
//     (the warning simply remains).
import { Blob as ExpoBlob } from "expo-blob";

if (typeof ExpoBlob === "function") {
  try {
    Object.defineProperty(globalThis, "Blob", {
      value: ExpoBlob,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  } catch {
    // Redefinition refused — keep React Native's Blob.
  }
}

export {};
