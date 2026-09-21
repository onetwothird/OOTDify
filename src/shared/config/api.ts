// C:\OOTDify\src\shared\config\api.ts
// Central place for the Flask/AI backend base URL.
//
// Resolution order (most reliable first):
//   1. EXPO_PUBLIC_API_URL from .env.local — set to your PC's LAN IP when
//      testing on a physical phone:  EXPO_PUBLIC_API_URL=http://192.168.x.x:5000
//   2. Native (Expo Go / dev builds): derive the dev machine's LAN IP from
//      Metro's hostUri — the phone already talks to Metro on that IP, and
//      Flask listens on the same machine (port 5000). No IP is hardcoded.
//   3. Web: localhost:5000 works because the browser runs on the same machine
//      as Flask.
//
// NEVER put backend/private secrets here or in any EXPO_PUBLIC_* variable —
// everything prefixed EXPO_PUBLIC_ is inlined into the client bundle.
import Constants from "expo-constants";
import { Platform } from "react-native";

// Default request timeout for backend calls (ms).
export const API_TIMEOUT_MS = 30_000;
// Longer timeout for slow AI inferences (image analysis can take a while).
export const API_AI_TIMEOUT_MS = 120_000;
// Health probe timeout (ms) — should answer fast or be considered down.
export const API_HEALTH_TIMEOUT_MS = 6_000;

/**
 * Best-effort extraction of the dev machine's LAN IPv4 from the Metro dev
 * server host (e.g. "192.168.1.4:8081" → "192.168.1.4"). Returns null when
 * there is no dev server (production builds, or web).
 */
function deriveDevHost(): string | null {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      // Expo Go exposes the debugger host on older SDKs
      (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
        .expoGoConfig?.debuggerHost;
    if (!hostUri) return null;
    const host = hostUri.split(":")[0];
    if (!host) return null;
    // Reject obviously non-LAN hosts; anything else is assumed usable on a LAN.
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
    return host;
  } catch {
    return null;
  }
}

export function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    // Strip trailing slashes so URL concatenation below stays clean.
    return fromEnv.replace(/\/+$/, "");
  }

  if (Platform.OS !== "web") {
    // Physical phones / emulators: point at the machine running Metro + Flask.
    const host = deriveDevHost();
    if (host) {
      return `http://${host}:5000`;
    }
    console.warn(
      "[api] EXPO_PUBLIC_API_URL is not set and no dev-server host was found. " +
        "Add EXPO_PUBLIC_API_URL to .env.local (e.g. http://192.168.1.50:5000) " +
        "for reliable networking on this device.",
    );
    return "";
  }

  const fallback = "http://localhost:5000";
  console.warn(
    `[api] EXPO_PUBLIC_API_URL is not set. Using ${fallback} for web. ` +
      "Set EXPO_PUBLIC_API_URL in .env.local to override.",
  );
  return fallback;
}

export const API_BASE_URL = resolveBaseUrl();

/** True when the base URL was configured (env var or dev host) — helps UI decide whether to offer a "check config" hint. */
export const isApiConfigured = API_BASE_URL.length > 0;

/** Turn a backend path like "/api/detect/annotated/x.jpg" into an absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl.trim();
  }
  return `${API_BASE_URL}/${pathOrUrl.replace(/^\/+/, "")}`;
}