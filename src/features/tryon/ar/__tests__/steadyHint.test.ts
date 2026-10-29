import { INITIAL_STEADY, isReadyToShoot, nextSteadyHint, type SteadyState } from "../steadyHint";

const start: SteadyState = { ...INITIAL_STEADY, shown: "step_back", candidate: "step_back", since: 0 };

describe("nextSteadyHint", () => {
  it("keeps the shown hint until a new one holds 300 ms", () => {
    let s = nextSteadyHint(start, "come_closer", 1000);
    expect(s.shown).toBe("step_back");
    s = nextSteadyHint(s, "come_closer", 1299);
    expect(s.shown).toBe("step_back");
  });

  it("switches after 300 ms", () => {
    let s = nextSteadyHint(start, "come_closer", 1000);
    s = nextSteadyHint(s, "come_closer", 1300);
    expect(s.shown).toBe("come_closer");
  });

  it("resets the timer when the candidate changes", () => {
    let s = nextSteadyHint(start, "come_closer", 1000);
    s = nextSteadyHint(s, "move_left", 1200);
    s = nextSteadyHint(s, "move_left", 1400);
    expect(s.shown).toBe("step_back");
    s = nextSteadyHint(s, "move_left", 1500);
    expect(s.shown).toBe("move_left");
  });

  it("drops a flicker that returns to the shown hint", () => {
    let s = nextSteadyHint(start, "come_closer", 1000);
    s = nextSteadyHint(s, "step_back", 1100);
    s = nextSteadyHint(s, "step_back", 2000);
    expect(s.shown).toBe("step_back");
    expect(s.candidate).toBe("step_back");
  });

  it("good is ready to shoot only after 500 ms", () => {
    let s = nextSteadyHint(start, "good", 1000);
    s = nextSteadyHint(s, "good", 1300);
    expect(s.shown).toBe("good");
    expect(isReadyToShoot(s, 1499)).toBe(false);
    expect(isReadyToShoot(s, 1500)).toBe(true);
    s = nextSteadyHint(s, "good", 1600);
    expect(isReadyToShoot(s, 1600)).toBe(true);
  });

  it("is never ready when the shown hint is not good", () => {
    expect(isReadyToShoot(start, 99999)).toBe(false);
  });
});
