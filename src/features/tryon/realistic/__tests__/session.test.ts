import {
  createDialGate,
  INITIAL_REALISTIC,
  isNotConfiguredError,
  realisticReducer,
  releasesCamera,
  sessionOpen,
  type RealisticPhase,
  type RealisticState,
} from "../session";

const at = (phase: RealisticPhase, secondsLeft = 0): RealisticState => ({ phase, secondsLeft });

describe("realisticReducer", () => {
  it("start without consent goes to consent", () => {
    expect(realisticReducer(INITIAL_REALISTIC, { type: "start", consented: false })).toEqual(at("consent"));
    // Accepting the sheet opens the session.
    expect(realisticReducer(at("consent"), { type: "consented" })).toEqual(at("connecting"));
  });

  it("start with consent goes to connecting", () => {
    expect(realisticReducer(INITIAL_REALISTIC, { type: "start", consented: true })).toEqual(at("connecting"));
  });

  it("connected sets live and secondsLeft", () => {
    expect(realisticReducer(at("connecting"), { type: "connected", sessionSeconds: 60 })).toEqual(at("live", 60));
    // A late "connected" after the user stopped must not reopen anything.
    expect(realisticReducer(at("ended"), { type: "connected", sessionSeconds: 60 })).toEqual(at("ended"));
  });

  it("tick counts down and ends at 0", () => {
    expect(realisticReducer(at("live", 60), { type: "tick" })).toEqual(at("live", 59));
    expect(realisticReducer(at("live", 2), { type: "tick" })).toEqual(at("live", 1));
    expect(realisticReducer(at("live", 1), { type: "tick" })).toEqual(at("ended", 0));
    // Ticks outside a live session change nothing.
    expect(realisticReducer(at("connecting"), { type: "tick" })).toEqual(at("connecting"));
    expect(realisticReducer(at("ended"), { type: "tick" })).toEqual(at("ended"));
  });

  it("stop and background end the session", () => {
    for (const type of ["stop", "background"] as const) {
      expect(realisticReducer(at("live", 30), { type })).toEqual(at("ended", 0));
      expect(realisticReducer(at("connecting"), { type })).toEqual(at("ended", 0));
      // Nothing is open on the consent sheet, so it just closes.
      expect(realisticReducer(at("consent"), { type })).toEqual(at("idle"));
      expect(realisticReducer(at("idle"), { type })).toEqual(at("idle"));
      expect(realisticReducer(at("failed"), { type })).toEqual(at("failed"));
    }
  });

  it("error goes to failed, or not_configured", () => {
    expect(realisticReducer(at("connecting"), { type: "error", notConfigured: false })).toEqual(at("failed"));
    expect(realisticReducer(at("live", 40), { type: "error", notConfigured: false })).toEqual(at("failed", 0));
    expect(realisticReducer(at("connecting"), { type: "error", notConfigured: true })).toEqual(at("not_configured"));
    // An error raised while tearing down an ended session doesn't relabel it.
    expect(realisticReducer(at("ended"), { type: "error", notConfigured: false })).toEqual(at("ended"));
  });

  it("unsupported (no WebRTC in this build) shows a message without opening a session", () => {
    expect(realisticReducer(INITIAL_REALISTIC, { type: "unsupported" })).toEqual(at("unsupported"));
    expect(sessionOpen("unsupported")).toBe(false);
    // Only from idle: it never relabels an open session.
    expect(realisticReducer(at("live", 30), { type: "unsupported" })).toEqual(at("live", 30));
    expect(realisticReducer(at("unsupported"), { type: "back" })).toEqual(at("idle"));
  });

  it("back returns to idle", () => {
    for (const phase of ["consent", "ended", "failed", "not_configured"] as const) {
      expect(realisticReducer(at(phase), { type: "back" })).toEqual(at("idle"));
    }
    // An open session must be stopped, not abandoned.
    expect(realisticReducer(at("live", 10), { type: "back" })).toEqual(at("live", 10));
  });

  it("ignores start while connecting or live", () => {
    const connecting = realisticReducer(INITIAL_REALISTIC, { type: "start", consented: true });
    expect(realisticReducer(connecting, { type: "start", consented: true })).toBe(connecting);
    const live = at("live", 50);
    expect(realisticReducer(live, { type: "start", consented: true })).toBe(live);
    expect(realisticReducer(at("consent"), { type: "start", consented: true })).toEqual(at("consent"));
    expect(realisticReducer(at("ended"), { type: "start", consented: true })).toEqual(at("ended"));
    expect(realisticReducer(live, { type: "consented" })).toBe(live);
  });
});

describe("sessionOpen / releasesCamera", () => {
  it("a session is open only while connecting or live", () => {
    expect(sessionOpen("connecting")).toBe(true);
    expect(sessionOpen("live")).toBe(true);
    for (const p of ["idle", "consent", "ended", "failed", "not_configured"] as const) expect(sessionOpen(p)).toBe(false);
  });

  it("the preview camera stays released until Back to live preview", () => {
    for (const p of ["connecting", "live", "ended", "failed", "not_configured"] as const) expect(releasesCamera(p)).toBe(true);
    expect(releasesCamera("idle")).toBe(false);
    expect(releasesCamera("consent")).toBe(false);
  });
});

describe("isNotConfiguredError", () => {
  it("matches only a 503 not_configured", () => {
    expect(isNotConfiguredError({ status: 503, payload: { success: false, error: "not_configured" } })).toBe(true);
    expect(isNotConfiguredError({ status: 502, payload: { success: false, error: "provider_error" } })).toBe(false);
    expect(isNotConfiguredError({ status: 503, payload: null })).toBe(false);
    expect(isNotConfiguredError(new Error("boom"))).toBe(false);
    expect(isNotConfiguredError(null)).toBe(false);
  });
});

describe("createDialGate", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("is idle when nothing was dialled", async () => {
    let done = false;
    void createDialGate()
      .idle()
      .then(() => (done = true));
    await flush();
    expect(done).toBe(true);
  });

  it("waits for a pending dial before the next session may dial", async () => {
    const gate = createDialGate();
    const dial = deferred<string>();
    void gate.track(dial.promise, () => {}, () => false);
    let done = false;
    void gate.idle().then(() => (done = true));
    await flush();
    expect(done).toBe(false);
    dial.resolve("client");
    await flush();
    expect(done).toBe(true);
  });

  it("releases a dial that resolves after its session was abandoned", async () => {
    const gate = createDialGate();
    const dial = deferred<string>();
    const released: string[] = [];
    let abandoned = false;
    void gate.track(dial.promise, (c) => released.push(c), () => abandoned);
    abandoned = true; // user tapped Stop while dialling
    dial.resolve("late-client");
    await gate.idle();
    expect(released).toEqual(["late-client"]);
  });

  it("leaves a dial that is still wanted alone", async () => {
    const gate = createDialGate();
    const released: string[] = [];
    await gate.track(Promise.resolve("client"), (c) => released.push(c), () => false);
    await gate.idle();
    expect(released).toEqual([]);
  });

  it("a failed dial still frees the gate, and track passes the rejection on", async () => {
    const gate = createDialGate();
    const dial = deferred<string>();
    const tracked = gate.track(dial.promise, () => {}, () => true);
    dial.reject(new Error("refused"));
    await expect(tracked).rejects.toThrow("refused");
    await expect(gate.idle()).resolves.toBeUndefined();
  });
});
