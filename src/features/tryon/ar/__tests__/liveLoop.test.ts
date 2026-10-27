import type { LivePose } from "../../../../services/aiApi";
import {
  createLiveLoop,
  FAILURE_BACKOFF_MS,
  LiveLoopState,
  LOOP_IDLE_MS,
  nextLoopDelay,
} from "../liveLoop";

const pose = (x: number): LivePose => ({
  personDetected: true,
  keypoints: [{ name: "nose", x, y: 0.2, confidence: 0.9 }],
  imageWidth: 360,
  imageHeight: 480,
  inferenceMs: 30,
});

const httpError = (status: number, retryAfterSeconds?: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status, retryAfterSeconds });

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

/** Runs the loop until `rounds` sleeps have happened, then stops it. */
async function run(
  results: (LivePose | Error)[],
  rounds = results.length,
): Promise<{ states: LiveLoopState[]; delays: number[]; captures: number }> {
  const states: LiveLoopState[] = [];
  const delays: number[] = [];
  let captures = 0;
  let i = 0;
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  const loop = createLiveLoop({
    capture: async () => {
      captures++;
      return `file:///frame-${captures}.jpg`;
    },
    estimate: async () => {
      const r = results[Math.min(i++, results.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
    onState: (s) => states.push(s),
    sleep: async (ms) => {
      delays.push(ms);
      if (delays.length >= rounds) {
        loop.stop();
        finish();
      }
    },
    onEnd: () => finish(),
  });
  loop.start();
  await done;
  await flush();
  return { states, delays, captures };
}

describe("nextLoopDelay", () => {
  it("waits LOOP_IDLE_MS after success", () => {
    expect(nextLoopDelay({ ok: true }, 0)).toBe(LOOP_IDLE_MS);
    expect(LOOP_IDLE_MS).toBe(150);
  });

  it("backs off 1s, 2s, 4s, then stays at 4s", () => {
    expect(FAILURE_BACKOFF_MS).toEqual([1000, 2000, 4000]);
    expect([1, 2, 3, 4, 9].map((n) => nextLoopDelay({ ok: false }, n))).toEqual([1000, 2000, 4000, 4000, 4000]);
  });

  it("honours Retry-After on 429", () => {
    expect(nextLoopDelay({ ok: false, status: 429, retryAfterSeconds: 7 }, 1)).toBe(7000);
  });

  it("waits 5s on 429 without Retry-After", () => {
    expect(nextLoopDelay({ ok: false, status: 429 }, 1)).toBe(5000);
  });
});

describe("createLiveLoop", () => {
  it("publishes each pose and resets after success", async () => {
    const { states, delays } = await run([pose(0.1), pose(0.2)]);
    expect(states.map((s) => s.pose?.keypoints[0].x)).toEqual([0.1, 0.2]);
    expect(states[1]).toMatchObject({ failureStreak: 0, lost: false, rateLimited: false, signedOut: false });
    expect(delays).toEqual([150, 150]);
  });

  it("never overlaps requests", async () => {
    let release!: (p: LivePose) => void;
    let captures = 0;
    const loop = createLiveLoop({
      capture: async () => `file:///frame-${++captures}.jpg`,
      estimate: () => new Promise<LivePose>((r) => (release = r)),
      onState: () => {},
      sleep: async () => {},
    });
    loop.start();
    loop.start(); // a second start must not spawn a second loop
    await flush();
    expect(captures).toBe(1);
    await flush();
    expect(captures).toBe(1);
    release(pose(0.1));
    await flush();
    expect(captures).toBe(2);
    loop.stop();
    release(pose(0.2));
  });

  it("keeps the last pose and flags lost after 3 failures", async () => {
    const err = httpError(500);
    const { states } = await run([pose(0.3), err, err, err]);
    expect(states.map((s) => s.lost)).toEqual([false, false, false, true]);
    expect(states[3].pose?.keypoints[0].x).toBe(0.3);
    expect(states[3].failureStreak).toBe(3);
  });

  it("treats a failed capture as a failed round", async () => {
    const states: LiveLoopState[] = [];
    let rounds = 0;
    const loop = createLiveLoop({
      capture: async () => {
        throw new Error("camera busy");
      },
      estimate: async () => pose(0.1),
      onState: (s) => states.push(s),
      sleep: async () => {
        if (++rounds >= 1) loop.stop();
      },
    });
    loop.start();
    await flush();
    expect(states[0]).toMatchObject({ failureStreak: 1, pose: null });
  });

  it("429 sets rateLimited but not lost and waits Retry-After", async () => {
    const limited = httpError(429, 3);
    const { states, delays } = await run([limited, limited, limited, limited]);
    expect(states[3]).toMatchObject({ rateLimited: true, lost: false, failureStreak: 0 });
    expect(delays).toEqual([3000, 3000, 3000, 3000]);
  });

  it("clears rateLimited once a request succeeds", async () => {
    const { states } = await run([httpError(429, 1), pose(0.4)]);
    expect(states.map((s) => s.rateLimited)).toEqual([true, false]);
  });

  it.each([401, 403])("stops and flags signedOut on %d", async (status) => {
    const { states, captures, delays } = await run([httpError(status), pose(0.1)], 5);
    expect(captures).toBe(1);
    expect(delays).toEqual([]);
    expect(states[states.length - 1].signedOut).toBe(true);
  });

  it("does nothing after stop()", async () => {
    let release!: (p: LivePose) => void;
    let captures = 0;
    const onState = jest.fn();
    const loop = createLiveLoop({
      capture: async () => `file:///frame-${++captures}.jpg`,
      estimate: () => new Promise<LivePose>((r) => (release = r)),
      onState,
      sleep: async () => {},
    });
    loop.start();
    await flush();
    loop.stop();
    release(pose(0.1));
    await flush();
    await flush();
    expect(onState).not.toHaveBeenCalled();
    expect(captures).toBe(1);
  });
});
