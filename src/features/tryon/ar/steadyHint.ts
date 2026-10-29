// Keeps the framing hint from flickering: a new hint must hold for a moment
// before it replaces the shown one. Pure; the hook in useSteadyHint.ts drives it.
import type { FramingHint } from "./framing";

/** A new hint must hold this long before it replaces the shown one. */
export const SWITCH_MS = 300;
/** "good" must have held this long before the shot is allowed. */
export const READY_MS = 500;

export interface SteadyState {
  shown: FramingHint;
  candidate: FramingHint;
  /** When `candidate` was first seen (the hint has been steady since then). */
  since: number;
}

export const INITIAL_STEADY: SteadyState = { shown: "no_person", candidate: "no_person", since: 0 };

export function nextSteadyHint(state: SteadyState, hint: FramingHint, nowMs: number): SteadyState {
  if (hint !== state.candidate) {
    // A different hint restarts the clock; going back to the shown one just cancels the switch.
    return { shown: state.shown, candidate: hint, since: nowMs };
  }
  if (hint !== state.shown && nowMs - state.since >= SWITCH_MS) {
    return { shown: hint, candidate: hint, since: state.since };
  }
  return state;
}

/** True once the shown hint is "good" and it has been steady for READY_MS. */
export function isReadyToShoot(state: SteadyState, nowMs: number): boolean {
  return state.shown === "good" && state.candidate === "good" && nowMs - state.since >= READY_MS;
}
