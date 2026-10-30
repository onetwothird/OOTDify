import { accessoryFit, quadsToMesh, type Quad } from "../accessoryFit";
import type { Bounds } from "../bodyMesh";
import type { Keypoint, Point } from "../overlayGeometry";

type Pt = [number, number, number?];

const POSE: Record<string, Pt> = {
  nose: [0.5, 0.23],
  left_eye: [0.47, 0.2],
  right_eye: [0.53, 0.2],
  left_ear: [0.44, 0.21],
  right_ear: [0.56, 0.21],
  left_shoulder: [0.4, 0.32],
  right_shoulder: [0.6, 0.32],
  left_elbow: [0.38, 0.45],
  right_elbow: [0.62, 0.45],
  left_wrist: [0.37, 0.56],
  right_wrist: [0.63, 0.56],
  left_hip: [0.43, 0.6],
  right_hip: [0.57, 0.6],
  left_ankle: [0.44, 0.95],
  right_ankle: [0.56, 0.95],
};

function pose(over: Record<string, Pt | undefined> = {}): Keypoint[] {
  const merged: Record<string, Pt | undefined> = { ...POSE, ...over };
  return Object.entries(merged)
    .filter((e): e is [string, Pt] => e[1] !== undefined)
    .map(([name, [x, y, c]]) => ({ name, x, y, confidence: c ?? 0.9 }));
}

const FULL: Bounds = { x: 0, y: 0, width: 1, height: 1 };

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const width = (q: Quad) => dist(q.corners[0], q.corners[1]);
const height = (q: Quad) => dist(q.corners[1], q.corners[2]);
const topCentre = (q: Quad) => mid(q.corners[0], q.corners[1]);
const bottomCentre = (q: Quad) => mid(q.corners[3], q.corners[2]);
const centre = (q: Quad) => mid(topCentre(q), bottomCentre(q));

function quads(...args: Parameters<typeof accessoryFit>): Quad[] {
  const fit = accessoryFit(...args);
  if (fit.kind !== "quads") throw new Error(`expected quads, got ${fit.kind}`);
  return fit.quads;
}

function expectPoint(p: Point, x: number, y: number) {
  expect(p.x).toBeCloseTo(x, 3);
  expect(p.y).toBeCloseTo(y, 3);
}

describe("accessoryFit", () => {
  it("hat sits above the eyes, as wide as the ears", () => {
    const [q] = quads("hat", pose(), FULL);
    expect(width(q)).toBeCloseTo(1.7 * 0.12, 3);
    expectPoint(bottomCentre(q), 0.5, 0.2 - 0.55 * 0.12);
  });

  it("hat falls back to the eyes without ears", () => {
    const [q] = quads("hat", pose({ left_ear: undefined, right_ear: undefined }), FULL);
    expect(width(q)).toBeCloseTo(2.8 * 0.06, 3);
  });

  it("glasses centre on the eyes", () => {
    const [q] = quads("glasses", pose(), FULL);
    expect(width(q)).toBeCloseTo(2.3 * 0.06, 3);
    expectPoint(centre(q), 0.5, 0.2);
  });

  it("earrings hang below each ear", () => {
    const qs = quads("earrings", pose(), FULL);
    expect(qs).toHaveLength(2);
    expectPoint(topCentre(qs[0]), 0.44, 0.21);
    expectPoint(topCentre(qs[1]), 0.56, 0.21);
    for (const q of qs) expect(width(q)).toBeCloseTo(0.35 * 0.12, 3);
  });

  it("necklace sits at the neck", () => {
    const [q] = quads("necklace", pose(), FULL);
    expectPoint(topCentre(q), 0.5, 0.32 + 0.25 * (0.23 - 0.32));
    expect(width(q)).toBeCloseTo(0.8 * 0.2, 3);
  });

  it("watch sits on the left wrist, scaled to the forearm", () => {
    const [q] = quads("watch", pose(), FULL);
    expectPoint(centre(q), 0.37, 0.56);
    expect(width(q)).toBeCloseTo(0.45 * Math.hypot(0.01, 0.11), 3);
  });

  it("belt centres on the hips", () => {
    const [q] = quads("belt", pose(), FULL);
    expectPoint(centre(q), 0.5, 0.6);
    expect(width(q)).toBeCloseTo(1.35 * 0.14, 3);
  });

  it("bag hangs from the right hip", () => {
    const [q] = quads("bag", pose(), FULL);
    expectPoint(topCentre(q), 0.57, 0.6);
    expect(width(q)).toBeCloseTo(0.9 * 0.14, 3);
  });

  it("shoes sit on both ankles", () => {
    const qs = quads("shoes", pose(), FULL);
    expect(qs).toHaveLength(2);
    expectPoint(topCentre(qs[0]), 0.44, 0.95);
    expectPoint(topCentre(qs[1]), 0.56, 0.95);
    for (const q of qs) expect(width(q)).toBeCloseTo(0.5 * 0.14, 3);
  });

  it("keeps the image aspect", () => {
    const [q] = quads("belt", pose(), { x: 0.1, y: 0.2, width: 0.8, height: 0.2 });
    expect(height(q)).toBeCloseTo(width(q) * (0.2 / 0.8), 4);
  });

  it("hat tilts with the eye line", () => {
    const [q] = quads("hat", pose({ right_eye: [0.53, 0.23] }), FULL);
    const [a, b] = q.corners;
    expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(0.03 / 0.06, 4);
  });

  it("watch turns with the forearm", () => {
    const [q] = quads("watch", pose(), FULL);
    const edge = { x: q.corners[1].x - q.corners[0].x, y: q.corners[1].y - q.corners[0].y };
    const forearm = { x: 0.37 - 0.38, y: 0.56 - 0.45 };
    expect(edge.x * forearm.x + edge.y * forearm.y).toBeCloseTo(0, 6);
  });

  it("missing keypoints give no_pose", () => {
    expect(accessoryFit("hat", pose({ left_eye: undefined }), FULL).kind).toBe("no_pose");
    expect(accessoryFit("watch", pose({ left_wrist: [0.37, 0.56, 0.1] }), FULL).kind).toBe("no_pose");
    expect(accessoryFit("necklace", pose({ nose: undefined }), FULL).kind).toBe("no_pose");
  });

  it("shoe pair photo is split; single shoe is mirrored", () => {
    const pair = quads("shoes", pose(), { x: 0, y: 0, width: 1, height: 0.5 });
    expect(pair.map((q) => [q.tex.x, q.tex.x + q.tex.width])).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
    expect(pair.every((q) => !q.mirror)).toBe(true);

    const single = quads("shoes", pose(), { x: 0, y: 0, width: 0.5, height: 1 });
    expect(single.every((q) => q.tex.width === 0.5)).toBe(true);
    expect(single.filter((q) => q.mirror)).toHaveLength(1);
  });

  it("never emits NaN", () => {
    expect(accessoryFit("glasses", pose({ right_eye: [0.47, 0.2] }), FULL).kind).toBe("no_pose");
    expect(accessoryFit("belt", pose({ left_hip: [0.43, 0.6, NaN] }), FULL).kind).toBe("no_pose");
  });
});

/** The same person seen from the back camera: the preview isn't mirrored, so left joints sit on screen right. */
function backCamera(over: Record<string, Pt | undefined> = {}): Keypoint[] {
  return pose(over).map((k) => ({ ...k, x: 1 - k.x }));
}

describe("accessoryFit on the back camera", () => {
  it("hat still sits above the eyes", () => {
    const [q] = quads("hat", backCamera(), FULL);
    expectPoint(bottomCentre(q), 0.5, 0.2 - 0.55 * 0.12);
    expect(topCentre(q).y).toBeLessThan(bottomCentre(q).y);
  });

  it("hanging items still grow downward from their anchors", () => {
    for (const kind of ["earrings", "necklace", "bag", "shoes"] as const) {
      for (const q of quads(kind, backCamera(), FULL)) expect(bottomCentre(q).y).toBeGreaterThan(topCentre(q).y);
    }
  });

  it("glasses and belt stay upright", () => {
    for (const kind of ["glasses", "belt"] as const) {
      const [q] = quads(kind, backCamera(), FULL);
      expect(bottomCentre(q).y).toBeGreaterThan(topCentre(q).y);
    }
  });

  it("shoes stay on their own ankles", () => {
    const qs = quads("shoes", backCamera(), { x: 0, y: 0, width: 0.5, height: 1 });
    expectPoint(topCentre(qs[0]), 1 - 0.44, 0.95);
    expectPoint(topCentre(qs[1]), 1 - 0.56, 0.95);
    expect(qs[1].mirror).toBe(true);
  });
});

describe("quadsToMesh", () => {
  const quad: Quad = {
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    tex: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
    mirror: false,
  };

  it("draws a quad as two triangles", () => {
    const m = quadsToMesh([quad]);
    expect(m.vertices).toHaveLength(4);
    expect(m.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(m.texCoords[0]).toEqual({ x: 0.2, y: 0.1 });
    expect(m.texCoords[2]).toEqual({ x: 0.8, y: 0.9 });
  });

  it("offsets indices for a second quad", () => {
    expect(quadsToMesh([quad, quad]).indices.slice(6)).toEqual([4, 5, 6, 4, 6, 7]);
  });

  it("mirror swaps left and right texture x", () => {
    const m = quadsToMesh([{ ...quad, mirror: true }]);
    expect(m.texCoords[0].x).toBeCloseTo(0.8);
    expect(m.texCoords[1].x).toBeCloseTo(0.2);
  });
});
