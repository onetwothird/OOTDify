import { holdStep, type HoldState } from "../outfitHold";

const EMPTY: HoldState<string> = { mesh: {}, lostAt: {} };

describe("holdStep", () => {
  it("keeps each item's own mesh when the outfit order changes", () => {
    const a = holdStep(EMPTY, [{ id: "top", mesh: "top-mesh" }], 0);
    // Shoes load and sort before the top, out of view: they get no mesh.
    const b = holdStep(a, [{ id: "shoes", mesh: null }, { id: "top", mesh: null }], 10);
    expect(b.mesh.shoes).toBeUndefined();
    expect(b.mesh.top).toBe("top-mesh");
  });

  it("marks a held mesh lost once, at the first frame without a fit", () => {
    const a = holdStep(EMPTY, [{ id: "hat", mesh: "m" }], 0);
    expect(a.lostAt.hat).toBe(-1);
    const b = holdStep(a, [{ id: "hat", mesh: null }], 10);
    const c = holdStep(b, [{ id: "hat", mesh: null }], 20);
    expect(b.lostAt.hat).toBe(10);
    expect(c.lostAt.hat).toBe(10);
    expect(holdStep(c, [{ id: "hat", mesh: "m2" }], 30)).toEqual({ mesh: { hat: "m2" }, lostAt: { hat: -1 } });
  });

  it("drops items no longer in the outfit", () => {
    const a = holdStep(EMPTY, [{ id: "hat", mesh: "m" }], 0);
    expect(holdStep(a, [], 10)).toEqual({ mesh: {}, lostAt: {} });
  });
});
