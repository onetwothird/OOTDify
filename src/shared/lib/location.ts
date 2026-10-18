// C:\OOTDify\src\shared\lib\location.ts
// Current place for the home header, from the device's real GPS + reverse
// geocoding (expo-location). Nothing is guessed: when permission is missing,
// the position cannot be read, or geocoding returns nothing, we report that
// honestly instead of inventing a city.
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

export interface CurrentPlace {
  label: string;
}

function formatAddress(geo: Location.LocationGeocodedAddress): CurrentPlace | null {
  const city = geo.city ?? geo.subregion ?? geo.district ?? null;
  const region = geo.region && geo.region !== city ? geo.region : null;
  const parts = [city, region].filter(Boolean) as string[];
  const label = parts.join(", ") || geo.country || null;
  return label ? { label } : null;
}

/**
 * Reverse-geocode the current position.
 * @param requestPermission When false, an undetermined permission is NOT
 * prompted — the call simply reports "blocked" so the UI can ask on tap.
 */
export async function getCurrentPlace(requestPermission: boolean): Promise<CurrentPlace | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && requestPermission && perm.canAskAgain) {
      perm = await Location.requestForegroundPermissionsAsync();
    }
    if (!perm.granted) return null;

    const position =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (!position) return null;

    const results = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const first = results[0];
    return first ? formatAddress(first) : null;
  } catch {
    return null;
  }
}

export type PlaceStatus = "loading" | "ready" | "blocked";

/**
 * Header-friendly place state. It locates automatically on mount (prompting for
 * permission once the first time the app is opened), and stays refreshable by
 * tapping the header chip.
 */
export function useCurrentPlace() {
  const [label, setLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaceStatus>("loading");

  const load = useCallback(async (requestPermission: boolean) => {
    setStatus("loading");
    const place = await getCurrentPlace(requestPermission);
    setLabel(place?.label ?? null);
    setStatus(place ? "ready" : "blocked");
  }, []);

  useEffect(() => {
    // Auto-locate on open — permission is requested once, then reused.
    Promise.resolve()
      .then(() => load(true))
      .catch(() => {});
  }, [load]);

  const request = useCallback(() => {
    void load(true);
  }, [load]);

  return { label, status, request };
}
