// C:\OOTDify\src\shared\lib\storageUrl.ts
// Resolves private storage refs into short-lived signed URLs.
//
// PRIVACY: user-owned buckets (users, wardrobe, tryons, avatars) are PRIVATE.
// The DB only ever stores refs like "users/<uid>/<uuid>.jpg". To display an
// image we ask Supabase for a signed URL (default 15 min expiry). The RLS
// select policy (auth.uid() = owner_id) guarantees the signed URL can only be
// created for the current user's own objects.

import { supabase } from "./supabase";

const KNOWN_BUCKETS = ["users", "wardrobe", "tryons", "avatars", "clothing", "community"];

// ---------------------------------------------------------------------------
// Signed-URL cache
//
// Multiple cards on the same screen often render the same storage ref (e.g. a
// catalog thumbnail used by ClothingCard + a detail screen). Without a cache
// every mount fires its own createSignedUrl request — duplicate downloads and
// avoidable latency. Entries live well below the signed-URL expiry (cache TTL
// = expiry − 60 s), so a cached URL can never outlive its validity, and the
// cache is wiped on sign-out so one account's URLs never serve to the next.
// ---------------------------------------------------------------------------
interface CacheEntry {
  url: string;
  expiresAt: number; // epoch ms after which the entry must not be used
}

const signedUrlCache = new Map<string, CacheEntry>();
const CACHE_MARGIN_MS = 60_000;

// Wipe on sign-out / user switch (module-level listener, one per app run).
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") signedUrlCache.clear();
});

/**
 * Turn a stored media ref into a renderable URL:
 *   - http(s) URLs are returned unchanged (catalog/seed/external images).
 *   - `bucket/path` refs are resolved via a short-lived signed URL.
 * Returns null when the ref is empty, malformed, or signing fails.
 */
export async function resolveMediaUrl(
  ref: string | null | undefined,
  expirySeconds = 900,
): Promise<string | null> {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const slash = trimmed.indexOf("/");
  if (slash < 1) return null;
  const bucket = trimmed.slice(0, slash);
  const objectPath = trimmed.slice(slash + 1);
  if (!objectPath || !KNOWN_BUCKETS.includes(bucket)) return null;

  const cacheKey = `${bucket}/${objectPath}@${expirySeconds}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, expirySeconds);
    if (error) {
      console.warn(`[storageUrl] sign failed for ${bucket}/${objectPath}:`, error.message);
      return null;
    }
    const url = data?.signedUrl ?? null;
    if (url) {
      signedUrlCache.set(cacheKey, {
        url,
        expiresAt: Date.now() + expirySeconds * 1000 - CACHE_MARGIN_MS,
      });
    }
    return url;
  } catch (e) {
    console.warn(`[storageUrl] sign threw for ${bucket}/${objectPath}:`, e);
    return null;
  }
}

/** Resolve many refs in parallel; keeps array order (null where unresolvable). */
export async function resolveMediaUrls(
  refs: (string | null | undefined)[],
  expirySeconds = 900,
): Promise<(string | null)[]> {
  return Promise.all(refs.map((r) => resolveMediaUrl(r, expirySeconds)));
}