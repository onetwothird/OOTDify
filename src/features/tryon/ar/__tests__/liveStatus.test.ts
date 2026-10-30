import type { MeshFit } from "../bodyMesh";
import { liveStatus, liveStatusKey, type ItemCutout } from "../liveStatus";

const mesh = { kind: "mesh" } as unknown as MeshFit;
const noPose = { kind: "no_pose" } as MeshFit;
const unsupported = { kind: "unsupported" } as MeshFit;

describe("liveStatusKey", () => {
  it("is silent when the garment is placed", () => {
    expect(liveStatusKey(mesh.kind, "ready", "ready")).toBeNull();
  });

  it("says unsupported before anything else", () => {
    expect(liveStatusKey(unsupported.kind, "failed", "failed")).toBe("tryon.live.unsupported");
  });

  it("reports a failed tracker over loading and the cut-out", () => {
    expect(liveStatusKey(noPose.kind, "failed", "loading")).toBe("tryon.live.tracker_failed");
  });

  it("says the tracker is loading before the cut-out state", () => {
    expect(liveStatusKey(noPose.kind, "loading", "failed")).toBe("tryon.live.loading");
  });

  it("says the garment is being prepared while the cut-out loads", () => {
    expect(liveStatusKey(mesh.kind, "ready", "loading")).toBe("tryon.live.cutout_loading");
  });

  it("says the item can't be shown when the cut-out failed, even with a placed mesh", () => {
    expect(liveStatusKey(mesh.kind, "ready", "failed")).toBe("tryon.live.cutout_failed");
  });

  it("puts the cut-out ahead of the framing guide", () => {
    expect(liveStatusKey(noPose.kind, "ready", "loading")).toBe("tryon.live.cutout_loading");
    expect(liveStatusKey(noPose.kind, "ready", "failed")).toBe("tryon.live.cutout_failed");
  });

  it("leaves a missing person or body to the framing guide", () => {
    expect(liveStatusKey(noPose.kind, "ready", "ready")).toBeNull();
  });
});

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
