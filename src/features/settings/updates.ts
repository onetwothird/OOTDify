// C:\OOTDify\src\features\settings\updates.ts
// Honest "check for updates" against the published store listing.
//
// iOS: Apple exposes a public lookup API (itunes.apple.com/lookup) that
//       returns the currently published version for a bundle id — a real,
//       verifiable comparison. Android: Google publishes no equivalent API,
//       so we say that plainly instead of pretending to check.
//
// There is no expo-updates module in this build, so even when an update
// exists the app cannot self-install it — the result always tells the user
// where to go get it.
import * as Application from "expo-application";
import { Platform } from "react-native";

export type UpdateStatus =
  | "up-to-date"
  | "update-available"
  | "not-published"
  | "check-failed"
  | "no-store-api";

export interface UpdateCheckResult {
  status: UpdateStatus;
  installed: string | null;
  store: string | null;
  message: string;
}

/** Numeric dotted-version compare: -1, 0, or 1. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/**
 * Checks the platform's published listing for a newer version than the one
 * installed. Never fabricates a result: on platforms without a public API or
 * when the network fails, it says exactly that.
 */
export async function checkForStoreUpdate(): Promise<UpdateCheckResult> {
  const installed = Application.nativeApplicationVersion;
  const appId = Application.applicationId;

  if (Platform.OS === "ios" && appId) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(appId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { results?: { version?: string }[] };
      const store = json.results?.[0]?.version ?? null;
      if (!store) {
        return {
          status: "not-published",
          installed,
          store: null,
          message:
            "No App Store listing was found for this build — you're running the latest local version.",
        };
      }
      if (installed && compareVersions(store, installed) > 0) {
        return {
          status: "update-available",
          installed,
          store,
          message: `Version ${store} is available on the App Store.`,
        };
      }
      return {
        status: "up-to-date",
        installed,
        store,
        message: "You're up to date with the published App Store listing.",
      };
    } catch {
      return {
        status: "check-failed",
        installed,
        store: null,
        message:
          "Couldn't reach the App Store to check right now. Try again later.",
      };
    }
  }

  return {
    status: "no-store-api",
    installed,
    store: null,
    message:
      Platform.OS === "android"
        ? "Google Play publishes no public version API, so the Play Store delivers updates automatically. Installed version shown above."
        : "This platform has no public store API to check against. Installed version shown above.",
  };
}
