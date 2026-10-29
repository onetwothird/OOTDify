import type { MeshFit } from "../bodyMesh";
import { liveStatusKey } from "../liveStatus";

const mesh = { kind: "mesh" } as unknown as MeshFit;
const noPose = { kind: "no_pose" } as MeshFit;
const unsupported = { kind: "unsupported" } as MeshFit;

describe("liveStatusKey", () => {
  it("is silent when the garment is placed", () => {
    expect(liveStatusKey("Tops", mesh.kind, "ready", true, "ready")).toBeNull();
  });

  it("says unsupported before anything else", () => {
    expect(liveStatusKey("Shoes", unsupported.kind, "failed", false, "failed")).toBe("tryon.live.unsupported");
  });

  it("reports a failed tracker over loading, the cut-out and a missing person", () => {
    expect(liveStatusKey("Tops", noPose.kind, "failed", false, "loading")).toBe("tryon.live.tracker_failed");
  });

  it("says the tracker is loading before the cut-out state", () => {
    expect(liveStatusKey("Tops", noPose.kind, "loading", false, "failed")).toBe("tryon.live.loading");
  });

  it("says the garment is being prepared while the cut-out loads", () => {
    expect(liveStatusKey("Tops", mesh.kind, "ready", true, "loading")).toBe("tryon.live.cutout_loading");
  });

  it("says the item can't be shown when the cut-out failed, even with a placed mesh", () => {
    expect(liveStatusKey("Tops", mesh.kind, "ready", true, "failed")).toBe("tryon.live.cutout_failed");
  });

  it("puts the cut-out ahead of looking for a person", () => {
    expect(liveStatusKey("Tops", noPose.kind, "ready", false, "loading")).toBe("tryon.live.cutout_loading");
    expect(liveStatusKey("Tops", noPose.kind, "ready", false, "failed")).toBe("tryon.live.cutout_failed");
  });

  it("says it is looking when the tracker is ready but nobody is in frame", () => {
    expect(liveStatusKey("Tops", noPose.kind, "ready", false, "ready")).toBe("tryon.live.starting");
  });

  it.each([
    ["Tops", "tryon.live.no_pose.upper"],
    ["outerwear", "tryon.live.no_pose.upper"],
    ["Dresses", "tryon.live.no_pose.dress"],
    ["Bottoms", "tryon.live.no_pose.lower"],
  ])("names the body parts %s needs once a person is seen", (category, key) => {
    expect(liveStatusKey(category, noPose.kind, "ready", true, "ready")).toBe(key);
  });
});
