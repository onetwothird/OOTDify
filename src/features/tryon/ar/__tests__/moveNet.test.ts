import { MOVENET_INPUT_SIZE, MOVENET_KEYPOINTS, parseMoveNet } from "../moveNet";

describe("parseMoveNet", () => {
  it("returns 17 keypoints in COCO order", () => {
    const result = parseMoveNet(new Float32Array(51));
    expect(result).toHaveLength(17);
    expect(result.map((k) => k.name)).toEqual([...MOVENET_KEYPOINTS]);
    expect(MOVENET_INPUT_SIZE).toBe(192);
  });

  it("swaps (y, x, score) into x/y/confidence", () => {
    const output = new Float32Array(51);
    output.set([0.2, 0.7, 0.9], 5 * 3);
    const shoulder = parseMoveNet(output)[5];
    expect(shoulder.name).toBe("left_shoulder");
    expect(shoulder.x).toBeCloseTo(0.7);
    expect(shoulder.y).toBeCloseTo(0.2);
    expect(shoulder.confidence).toBeCloseTo(0.9);
  });

  it("throws on a short output", () => {
    expect(() => parseMoveNet(new Float32Array(50))).toThrow(/51/);
  });
});
