// Parse an HTTP `Retry-After` header (RFC 9110: delay-seconds or an
// HTTP-date) into whole seconds to wait. Unusable values give `undefined` so
// callers fall back to their own default.

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d/.test(trimmed)) return undefined;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.round((at - now) / 1000));
}
