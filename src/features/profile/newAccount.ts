// Whether a sign-in just created the account. Google and Facebook sign-ups
// have no sign-up screen of their own, so this is how they still get the
// first-run onboarding. Pure, so tested.

/** First sign-in and creation land within this window of each other. */
const SAME_MOMENT_MS = 60_000;

export function isFirstSignIn(
  user: { created_at?: string | null; last_sign_in_at?: string | null } | null | undefined,
): boolean {
  const created = Date.parse(user?.created_at ?? "");
  const signedIn = Date.parse(user?.last_sign_in_at ?? "");
  if (Number.isNaN(created) || Number.isNaN(signedIn)) return false;
  return Math.abs(signedIn - created) <= SAME_MOMENT_MS;
}
