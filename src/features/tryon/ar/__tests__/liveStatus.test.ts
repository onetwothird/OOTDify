import type { MeshFit } from "../bodyMesh";
import { liveStatusKey } from "../liveStatus";

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
