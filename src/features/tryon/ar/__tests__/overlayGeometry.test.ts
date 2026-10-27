import {
  garmentFit,
  Keypoint,
  photoToPreview,
  pointToPreview,
  Rect,
} from "../overlayGeometry";

type Pt = [number, number, number?];

// A standing person, normalized photo coordinates, all points confident.
const BODY: Record<string, Pt> = {
  left_shoulder: [0.4, 0.3],
  right_shoulder: [0.6, 0.3],
  left_hip: [0.42, 0.6],
  right_hip: [0.58, 0.6],
  left_knee: [0.43, 0.75],
  right_knee: [0.57, 0.75],
  left_ankle: [0.44, 0.9],
  right_ankle: [0.56, 0.9],
};

function body(over: Record<string, Pt | undefined> = {}): Keypoint[] {
  const merged: Record<string, Pt | undefined> = { ...BODY, ...over };
  return Object.entries(merged)
    .filter((e): e is [string, Pt] => e[1] !== undefined)
    .map(([name, [x, y, confidence = 0.9]]) => ({ name, x, y, confidence }));
}

function expectRect(actual: Rect, expected: Rect) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

function rectOf(category: string | null, keypoints: Keypoint[]): Rect {
  const fit = garmentFit(category, keypoints);
  if (fit.kind !== "rect") throw new Error(`expected rect, got ${fit.kind}`);
  return fit.rect;
}

describe("garmentFit", () => {
  it("places a top from shoulders to hips", () => {
    // width 0.2 * 1.5 = 0.3 centred on 0.5; span 0.3 → top 0.3 - 0.036, bottom 0.6 + 0.015
    expectRect(rectOf("Tops", body()), { x: 0.35, y: 0.264, width: 0.3, height: 0.351 });
  });

  it("places outerwear like a top", () => {
    expectRect(rectOf("Outerwear", body()), { x: 0.35, y: 0.264, width: 0.3, height: 0.351 });
  });

  it("extends dresses to the knees", () => {
    // span 0.45 → top 0.3 - 0.054 = 0.246, bottom 0.75 + 0.0225 = 0.7725
    expectRect(rectOf("Dresses", body()), { x: 0.35, y: 0.246, width: 0.3, height: 0.5265 });
  });

  it("places bottoms from hips to ankles", () => {
    // hip width 0.16 * 1.8 = 0.288 centred on 0.5; span 0.3 → top 0.564, bottom 0.915
    expectRect(rectOf("Bottoms", body()), { x: 0.356, y: 0.564, width: 0.288, height: 0.351 });
  });

  it("is case-insensitive", () => {
    expect(garmentFit("outerwear", body()).kind).toBe("rect");
  });

  it.each(["Shoes", "Bags", "Accessories", "Other", null])("%s is unsupported", (category) => {
    expect(garmentFit(category, body()).kind).toBe("unsupported");
  });

  it("needs both hips for a top", () => {
    expect(garmentFit("Tops", body({ left_hip: undefined })).kind).toBe("no_pose");
  });

  it("ignores low-confidence points", () => {
    expect(garmentFit("Tops", body({ right_hip: [0.58, 0.6, 0.2] })).kind).toBe("no_pose");
  });

  it("does not need ankles for a top", () => {
    expect(garmentFit("Tops", body({ left_ankle: undefined, right_ankle: undefined })).kind).toBe("rect");
  });

  it("rejects an inverted body (hips above shoulders)", () => {
    const flipped = body({ left_hip: [0.42, 0.2], right_hip: [0.58, 0.2] });
    expect(garmentFit("Tops", flipped).kind).toBe("no_pose");
  });

  it("returns the anchors it used", () => {
    const fit = garmentFit("Tops", body());
    expect(fit.kind === "rect" && fit.anchors.top).toEqual([
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.3 },
    ]);
    expect(fit.kind === "rect" && fit.anchors.bottom).toEqual([
      { x: 0.42, y: 0.6 },
      { x: 0.58, y: 0.6 },
    ]);
  });

  it("returns no_pose for an empty frame", () => {
    expect(garmentFit("Tops", []).kind).toBe("no_pose");
  });
});

describe("preview mapping", () => {
  // photo 3:4 (300x400) into preview 300x600 → cover scale 1.5, offsetX -75, offsetY 0
  const photo = { width: 300, height: 400 };
  const preview = { width: 300, height: 600 };

  it("maps with a cover crop", () => {
    expectRect(photoToPreview({ x: 0.5, y: 0, width: 0.1, height: 0.5 }, photo, preview, false), {
      x: 150,
      y: 0,
      width: 45,
      height: 300,
    });
  });

  it("mirrors x for the front camera", () => {
    // x' = 1 - 0.5 - 0.1 = 0.4 → 0.4 * 450 - 75 = 105
    expectRect(photoToPreview({ x: 0.5, y: 0, width: 0.1, height: 0.5 }, photo, preview, true), {
      x: 105,
      y: 0,
      width: 45,
      height: 300,
    });
  });

  it("letterboxes vertically when the preview is wider", () => {
    // photo 400x300 into 300x600 → scale 2, scaled 800x600, offsetX -250
    const rect = photoToPreview({ x: 0.5, y: 0.5, width: 0.25, height: 0.5 }, { width: 400, height: 300 }, preview, false);
    expectRect(rect, { x: 150, y: 300, width: 200, height: 300 });
  });

  it("maps and mirrors a point", () => {
    expect(pointToPreview({ x: 0.25, y: 0.5 }, photo, preview, true)).toEqual({ x: 262.5, y: 300 });
  });
});
