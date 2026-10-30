// When happy Penggi celebrates: on a real sign-in, and once per app launch
// when the app opens already signed in. Signing out resets it so the next
// sign-in celebrates again. Pure, so the rules are unit-tested.

export function nextWelcome(
  event: string,
  hasSession: boolean,
  welcomed: boolean,
): { show: boolean; welcomed: boolean } {
  if (event === "SIGNED_OUT" || !hasSession) return { show: false, welcomed: false };
  if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && !welcomed) return { show: true, welcomed: true };
  return { show: false, welcomed };
}
