// C:\OOTDify\src\shared\lib\useResolvedImage.ts
// Resolves a storage ref / http URL to a renderable URL, with recovery for
// expired signed URLs.
//
// Signed URLs expire after 15 min (see storageUrl.ts). A tab screen can stay
// mounted longer than that, so an image that lazy-loads after expiry will 403.
// On image load error we re-sign the ref (fresh URL) a bounded number of times
// before giving up, so a transient/expiry failure recovers instead of showing
// a broken image indefinitely.
//
// Render output is DERIVED from ref-keyed state (the result carries the ref it
// was resolved for) instead of being cleared by synchronous setState calls in
// effects — changing `ref` instantly yields uri=null / failed=false without an
// extra effect-driven render pass.

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveMediaUrl } from "./storageUrl";

/** How many times we re-sign + retry after an image load error (spec: max 1 retry, then placeholder). */
const MAX_RETRIES = 1;

export interface ResolvedImage {
  /** Current renderable URL, or null while resolving / after final failure. */
  uri: string | null;
  /** True once every retry has failed; render a fallback instead. */
  failed: boolean;
  /** Call from an <Image onError> to re-sign and retry (no-op past the cap). */
  retry: () => void;
}

interface Resolved {
  /** `${ref}#${nonce}` this result belongs to. */
  key: string;
  uri: string | null;
  failed: boolean;
}

/**
 * Resolve `ref` (a `bucket/path` storage ref or an http(s) URL) to a URL.
 * - http(s) refs are returned as-is (no signing needed, never expire).
 * - storage refs are signed; on load error they are re-signed up to
 *   MAX_RETRIES times before `failed` latches true.
 */
export function useResolvedImage(ref: string | null | undefined): ResolvedImage {
  const [result, setResult] = useState<Resolved | null>(null);
  const attempts = useRef(0);
  // Bump to force the resolve effect to re-run (re-sign with a fresh URL).
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!ref) return;
    let alive = true;
    const key = `${ref}#${nonce}`;
    resolveMediaUrl(ref).then((u) => {
      if (!alive) return;
      if (u) {
        setResult({ key, uri: u, failed: false });
      } else {
        // Signing itself failed (bad ref / RLS denial) — not recoverable.
        setResult({ key, uri: null, failed: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [ref, nonce]);

  const retry = useCallback(() => {
    if (!ref) return;
    if (attempts.current >= MAX_RETRIES) {
      setResult({ key: `${ref}#${nonce}`, uri: null, failed: true });
      return;
    }
    attempts.current += 1;
    setNonce((n) => n + 1);
  }, [ref, nonce]);

  // Reset the retry budget whenever the underlying ref changes.
  useEffect(() => {
    attempts.current = 0;
  }, [ref]);

  // Only a result that belongs to the CURRENT ref (+ retry nonce) is visible;
  // anything stale renders as the neutral "resolving" state.
  const current = ref && result && result.key === `${ref}#${nonce}` ? result : null;
  return {
    uri: current?.failed ? null : (current?.uri ?? null),
    failed: current?.failed ?? false,
    retry,
  };
}
