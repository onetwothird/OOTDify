// C:\OOTDify\src\features\tryon\realistic\session.ts
// "Go realistic" session state: the phase machine and the countdown, kept pure
// (no React, no native) so every transition is unit-tested. The hook
// (useRealisticSession) only wires effects to these events.
//
// A session is open (camera streaming to Decart, billed per second) only while
// the phase is "connecting" or "live". Every way out of those two phases —
// stop, reaching 0, background, error — lands on a phase where sessionOpen() is
// false, and the hook tears the connection down on exactly that edge.

export type RealisticPhase = "idle" | "consent" | "connecting" | "live" | "ended" | "failed" | "not_configured";

export type RealisticState = { phase: RealisticPhase; secondsLeft: number };

export type RealisticEvent =
  | { type: "start"; consented: boolean }
  | { type: "consented" }
  | { type: "connected"; sessionSeconds: number }
  | { type: "tick" }
  | { type: "stop" }
  | { type: "background" }
  | { type: "error"; notConfigured: boolean }
  | { type: "back" };

export const INITIAL_REALISTIC: RealisticState = { phase: "idle", secondsLeft: 0 };

/** True while a Decart session may be open (and costing money). */
export function sessionOpen(phase: RealisticPhase): boolean {
  return phase === "connecting" || phase === "live";
}

/**
 * True while the on-device preview camera must stay inactive: from the moment
 * the session starts connecting (LiveKit needs the camera) until the user taps
 * "Back to live preview".
 */
export function releasesCamera(phase: RealisticPhase): boolean {
  return phase !== "idle" && phase !== "consent";
}

const at = (phase: RealisticPhase, secondsLeft = 0): RealisticState => ({ phase, secondsLeft });

export function realisticReducer(state: RealisticState, event: RealisticEvent): RealisticState {
  const { phase } = state;
  switch (event.type) {
    case "start":
      // Only from idle: a double tap, or a tap while a session is open, opens nothing.
      if (phase !== "idle") return state;
      return at(event.consented ? "connecting" : "consent");
    case "consented":
      return phase === "consent" ? at("connecting") : state;
    case "connected":
      return phase === "connecting" ? at("live", Math.max(1, Math.round(event.sessionSeconds))) : state;
    case "tick":
      if (phase !== "live") return state;
      return state.secondsLeft <= 1 ? at("ended", 0) : at("live", state.secondsLeft - 1);
    case "stop":
    case "background":
      if (sessionOpen(phase)) return at("ended", 0);
      return phase === "consent" ? at("idle") : state;
    case "error":
      if (!sessionOpen(phase)) return state;
      return at(event.notConfigured ? "not_configured" : "failed");
    case "back":
      return sessionOpen(phase) || phase === "idle" ? state : at("idle");
  }
}

/**
 * The token route's "realistic mode isn't set up" answer: HTTP 503 with
 * `{error: "not_configured"}`. Checked structurally (an ApiError carries
 * `status` and `payload`) so this file stays free of the API client.
 */
export function isNotConfiguredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { status, payload } = err as { status?: unknown; payload?: unknown };
  return (
    status === 503 &&
    !!payload &&
    typeof payload === "object" &&
    (payload as { error?: unknown }).error === "not_configured"
  );
}
