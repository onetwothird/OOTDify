// C:\OOTDify\src\features\settings\lockPolicy.ts
// When the biometric lock engages. Pure, so Jest can test it; BiometricGate
// supplies the clock and AppState.
//
// Only a real trip to the background counts. iOS reports "inactive" while the
// Face ID / Touch ID sheet is up, and a lock that fired on that would re-lock
// the moment the user unlocked.

/** A quick app switch (copying a code, answering a message) stays unlocked. */
export const LOCK_GRACE_MS = 30_000;

export function shouldLockOnReturn({
  enabled,
  backgroundedAt,
  now,
}: {
  enabled: boolean;
  /** When the app last went to the background, or null if it has not since unlocking. */
  backgroundedAt: number | null;
  now: number;
}): boolean {
  if (!enabled || backgroundedAt === null) return false;
  return now - backgroundedAt > LOCK_GRACE_MS;
}
