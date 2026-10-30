import { liveStatus, type ItemCutout } from "../liveStatus";

const item = (name: string, cutout: ItemCutout["cutout"], placeable = true): ItemCutout => ({ name, placeable, cutout });

describe("liveStatus", () => {
  it("says unsupported when no item can be placed", () => {
    expect(liveStatus([item("Ring", "ready", false)], "failed")).toEqual({ key: "tryon.live.unsupported" });
  });

  it("reports the tracker before the cut-outs", () => {
    expect(liveStatus([item("Tee", "loading")], "failed")).toEqual({ key: "tryon.live.tracker_failed" });
    expect(liveStatus([item("Tee", "failed")], "loading")).toEqual({ key: "tryon.live.loading" });
  });

  it("says the outfit is being prepared while every cut-out loads", () => {
    expect(liveStatus([item("Tee", "loading"), item("Hat", "loading")], "ready")).toEqual({
      key: "tryon.live.cutout_loading",
    });
  });

  it("says cut-out failed when every placeable cut-out failed", () => {
    expect(liveStatus([item("Tee", "failed"), item("Ring", "ready", false)], "ready")).toEqual({
      key: "tryon.live.cutout_failed",
    });
  });

  it("names the items it can't show while the rest are shown", () => {
    const items = [item("Tee", "ready"), item("Ring", "ready", false), item("Scarf", "failed"), item("Hat", "loading")];
    expect(liveStatus(items, "ready")).toEqual({ key: "tryon.live.cant_show", names: "Ring, Scarf" });
  });

  it("is silent once every item is shown", () => {
    expect(liveStatus([item("Tee", "ready"), item("Hat", "ready")], "ready")).toBeNull();
    expect(liveStatus([item("Tee", "ready"), item("Hat", "loading")], "ready")).toBeNull();
  });
});
