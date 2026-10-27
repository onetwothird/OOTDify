// C:\OOTDify\src\shared\lib\authRedirectHold.ts
// Lets a screen pause the root layout's auth-gate redirects while it runs a
// sign-in/sign-out sequence of its own. Email sign-up is the case: Supabase's
// signUp briefly returns a live session that the screen immediately signs out
// again, and without a hold the gate would bounce to Home (and on to
// onboarding) mid-sequence, then back to the auth screens, racing the
// screen's own navigation into a "route not found". Pure, so Jest can load it.

let holds = 0;

/** True while any held task is running; the auth gate skips redirects then. */
export function isAuthRedirectHeld(): boolean {
  return holds > 0;
}

/** Runs `task` with the auth-gate redirects paused, releasing even on error. */
export async function withAuthRedirectHeld<T>(task: () => Promise<T>): Promise<T> {
  holds += 1;
  try {
    return await task();
  } finally {
    holds -= 1;
  }
}
