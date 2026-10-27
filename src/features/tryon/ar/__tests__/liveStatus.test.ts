import type { LivePose } from "../../../../services/aiApi";
import { INITIAL_LIVE_STATE, LiveLoopState } from "../liveLoop";
import { liveStatusKey } from "../liveStatus";
import type { OverlayFit } from "../overlayGeometry";

const pose: LivePose = { personDetected: true, keypoints: [], imageWidth: 3, imageHeight: 4, inferenceMs: 1 };
const rect: OverlayFit = {
  kind: "rect",
  rect: { x: 0, y: 0, width: 1, height: 1 },
  anchors: { top: [{ x: 0, y: 0 }, { x: 1, y: 0 }], bottom: [{ x: 0, y: 1 }, { x: 1, y: 1 }] },
};
const loop = (over: Partial<LiveLoopState> = {}): LiveLoopState => ({ ...INITIAL_LIVE_STATE, pose, ...over });

describe("liveStatusKey", () => {
  it("is silent when the garment is placed", () => {
    expect(liveStatusKey("Tops", rect, loop())).toBeNull();
  });

  it("says unsupported before anything else", () => {
    expect(liveStatusKey("Shoes", { kind: "unsupported" }, loop({ lost: true, signedOut: true }))).toBe(
      "tryon.live.unsupported",
    );
  });

  it("asks to sign in again when the loop stopped", () => {
    expect(liveStatusKey("Tops", rect, loop({ signedOut: true, rateLimited: true }))).toBe("tryon.live.signed_out");
  });

  it("prefers rate limiting over a lost connection", () => {
    expect(liveStatusKey("Tops", rect, loop({ rateLimited: true, lost: true }))).toBe("tryon.live.rate_limited");
  });

  it("reports a lost connection over a missing pose", () => {
    expect(liveStatusKey("Tops", { kind: "no_pose" }, loop({ lost: true }))).toBe("tryon.live.lost");
  });

  it("says it is looking before the first pose arrives", () => {
    expect(liveStatusKey("Tops", { kind: "no_pose" }, loop({ pose: null }))).toBe("tryon.live.starting");
  });

  it.each([
    ["Tops", "tryon.live.no_pose.upper"],
    ["outerwear", "tryon.live.no_pose.upper"],
    ["Dresses", "tryon.live.no_pose.dress"],
    ["Bottoms", "tryon.live.no_pose.lower"],
  ])("names the body parts %s needs", (category, key) => {
    expect(liveStatusKey(category, { kind: "no_pose" }, loop())).toBe(key);
  });
});
