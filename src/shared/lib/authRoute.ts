// Where the root layout's auth gate sends the app for the current route.
// Pure, so the rules are unit-tested.
//
// Terms and Privacy are public reading material: the landing page links to
// them before anyone has an account. "privacy/data" is NOT public — it reads
// the signed-in user's own data. The empty root ("/", segments []) is only a
// launch pad, so a signed-in launch must leave it or the app stays blank.

export type AuthRedirect = { to: "/(auth)" | "/(tabs)/home" | "/consent"; replace: boolean } | null;

export function authRedirect(segments: string[], signedIn: boolean, consented: boolean): AuthRedirect {
  const inAuthGroup = segments[0] === "(auth)";
  const atRoot = segments.length === 0;
  const isLegalDoc = segments[0] === "privacy" && (segments[1] === "terms" || segments[1] === "policy");
  const atConsentGate = segments[0] === "consent" || isLegalDoc;
  if (!signedIn) return inAuthGroup || isLegalDoc ? null : { to: "/(auth)", replace: false };
  if (!consented) return atConsentGate ? null : { to: "/consent", replace: true };
  if (inAuthGroup || atRoot) return { to: "/(tabs)/home", replace: true };
  return null;
}
