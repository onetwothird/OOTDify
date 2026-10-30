// The last profile page load, kept in memory so the Profile tab opens with
// it straight away and refreshes in the background, instead of a blank page
// while five requests finish. Tagged with the account it belongs to and
// cleared on sign-out, so one account never sees another's profile. Pure,
// so tested.

let cached: { userId: string; data: unknown } | null = null;

export function readProfileCache<T>(userId: string | null): T | null {
  return userId && cached?.userId === userId ? (cached.data as T) : null;
}

export function writeProfileCache<T>(userId: string, data: T): void {
  cached = { userId, data };
}

export function clearProfileCache(): void {
  cached = null;
}
