// The live try-on snapshot loop: capture → estimate pose → publish → wait →
// repeat. Strictly sequential, so a slow network never stacks requests.
//
// Kept free of React/Expo imports so it can be unit-tested; errors are read
// structurally (`status`, `retryAfterSeconds`, as on `ApiError`).
import type { LivePose } from "../../../services/aiApi";

export const LOOP_IDLE_MS = 150;
export const FAILURE_BACKOFF_MS = [1000, 2000, 4000];
export const LOST_AFTER_FAILURES = 3;
const DEFAULT_RATE_LIMIT_WAIT_S = 5;

export type LoopOutcome = { ok: true } | { ok: false; status?: number; retryAfterSeconds?: number };

export interface LiveLoopState {
  /** Last successful pose; kept through failed rounds. */
  pose: LivePose | null;
  failureStreak: number;
  /** Several rounds in a row failed (network/server). */
  lost: boolean;
  /** The server asked us to slow down (429). */
  rateLimited: boolean;
  /** Session expired or consent missing: the loop has stopped itself. */
  signedOut: boolean;
}

export const INITIAL_LIVE_STATE: LiveLoopState = {
  pose: null,
  failureStreak: 0,
  lost: false,
  rateLimited: false,
  signedOut: false,
};

/**
 * Wraps `fn` so a call starts only after the previous call settled. Shared
 * across loop restarts so a stopped loop's pending camera capture never
 * overlaps the new loop's first one ("camera busy" on Android).
 */
export function serializeCalls<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    const run = () => fn(...args);
    const next = last.then(run, run);
    last = next.catch(() => undefined);
    return next;
  };
}

/** The loop state if it belongs to `key` (e.g. the camera facing), else a fresh one. */
export function liveStateFor(stored: { key: string; state: LiveLoopState }, key: string): LiveLoopState {
  return stored.key === key ? stored.state : INITIAL_LIVE_STATE;
}

/** How long to wait before the next round. */
export function nextLoopDelay(outcome: LoopOutcome, failureStreak: number): number {
  if (outcome.ok) return LOOP_IDLE_MS;
  if (outcome.status === 429) return (outcome.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_WAIT_S) * 1000;
  const step = Math.min(Math.max(failureStreak, 1), FAILURE_BACKOFF_MS.length) - 1;
  return FAILURE_BACKOFF_MS[step];
}

function toOutcome(err: unknown): { ok: false; status?: number; retryAfterSeconds?: number } {
  const e = err as { status?: unknown; retryAfterSeconds?: unknown } | null;
  return {
    ok: false,
    status: typeof e?.status === "number" ? e.status : undefined,
    retryAfterSeconds: typeof e?.retryAfterSeconds === "number" ? e.retryAfterSeconds : undefined,
  };
}

export interface LiveLoopDeps {
  capture: () => Promise<string>;
  estimate: (uri: string) => Promise<LivePose>;
  onState: (state: LiveLoopState) => void;
  sleep?: (ms: number) => Promise<void>;
  /** Called when the loop stops on its own (signed out). */
  onEnd?: () => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLiveLoop(deps: LiveLoopDeps): { start(): void; stop(): void } {
  const sleep = deps.sleep ?? defaultSleep;
  let running = false;
  let stopped = false;
  let state = INITIAL_LIVE_STATE;

  const publish = (next: LiveLoopState) => {
    state = next;
    deps.onState(next);
  };

  async function loop() {
    while (!stopped) {
      let outcome: LoopOutcome;
      try {
        const uri = await deps.capture();
        if (stopped) return;
        const pose = await deps.estimate(uri);
        if (stopped) return;
        outcome = { ok: true };
        publish({ ...INITIAL_LIVE_STATE, pose });
      } catch (err) {
        if (stopped) return;
        outcome = toOutcome(err);
        if (outcome.status === 401 || outcome.status === 403) {
          publish({ ...state, signedOut: true });
          stopped = true;
          deps.onEnd?.();
          return;
        }
        if (outcome.status === 429) {
          publish({ ...state, rateLimited: true });
        } else {
          const failureStreak = state.failureStreak + 1;
          publish({ ...state, failureStreak, lost: failureStreak >= LOST_AFTER_FAILURES });
        }
      }
      await sleep(nextLoopDelay(outcome, state.failureStreak));
    }
  }

  return {
    start() {
      if (running || stopped) return;
      running = true;
      void loop().finally(() => {
        running = false;
      });
    },
    stop() {
      stopped = true;
    },
  };
}
