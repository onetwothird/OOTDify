import type { Keypoint } from "../overlayGeometry";
import { createSmoother, smoothKeypoints } from "../smoothing";

const kp = (x: number, y = 0.5, confidence = 0.9): Keypoint => ({ name: "nose", x, y, confidence });

describe("smoothKeypoints", () => {
  it("passes the first sample through", () => {
    const state = createSmoother();
    const [out] = smoothKeypoints(state, [kp(0.4, 0.6)], 0);
    expect(out.x).toBe(0.4);
    expect(out.y).toBe(0.6);
  });

  it("damps jitter on a still point", () => {
    const state = createSmoother();
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) {
      const [out] = smoothKeypoints(state, [kp(i % 2 === 0 ? 0.5 : 0.52)], i * 33);
      xs.push(out.x);
    }
    for (const x of xs.slice(-10)) {
      expect(x).toBeGreaterThanOrEqual(0.505);
      expect(x).toBeLessThanOrEqual(0.515);
    }
  });

  it("follows a fast step", () => {
    const state = createSmoother();
    let t = 0;
    for (let i = 0; i < 10; i++, t += 33) smoothKeypoints(state, [kp(0.2)], t);
    let last = 0;
    for (let i = 0; i < 6; i++, t += 33) last = smoothKeypoints(state, [kp(0.8)], t)[0].x;
    expect(last).toBeGreaterThan(0.7);
  });

  it("resets a joint after low confidence", () => {
    const state = createSmoother();
    let t = 0;
    for (let i = 0; i < 5; i++, t += 33) smoothKeypoints(state, [kp(0.2)], t);
    smoothKeypoints(state, [kp(0.2, 0.5, 0.1)], t);
    t += 33;
    const [out] = smoothKeypoints(state, [kp(0.8)], t);
    expect(out.x).toBe(0.8);
  });

  it("keeps confidence unchanged", () => {
    const state = createSmoother();
    const [out] = smoothKeypoints(state, [kp(0.4, 0.5, 0.77)], 0);
    expect(out.confidence).toBe(0.77);
    expect(out.name).toBe("nose");
  });
});
