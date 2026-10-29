import { bodyMesh, isSupportedCategory, MESH_COLUMNS, STRIPS_PER_SEGMENT, type Bounds } from "../bodyMesh";
import type { Keypoint } from "../overlayGeometry";

type Pt = [number, number, number?];

const STANDING: Record<string, Pt> = {
  left_shoulder: [0.4, 0.3],
  right_shoulder: [0.6, 0.3],
  left_hip: [0.43, 0.6],
  right_hip: [0.57, 0.6],
  left_knee: [0.44, 0.78],
  right_knee: [0.56, 0.78],
  left_ankle: [0.45, 0.95],
  right_ankle: [0.55, 0.95],
};

function standing(over: Record<string, Pt | undefined> = {}): Keypoint[] {
  const merged: Record<string, Pt | undefined> = { ...STANDING, ...over };
  return Object.entries(merged)
    .filter((e): e is [string, Pt] => e[1] !== undefined)
    .map(([name, [x, y, confidence = 0.9]]) => ({ name, x, y, confidence }));
}

const FULL: Bounds = { x: 0, y: 0, width: 1, height: 1 };
const COLS = MESH_COLUMNS + 1;

function meshOf(category: string | null, kps: Keypoint[], garment: Bounds = FULL) {
  const fit = bodyMesh(category, kps, garment);
  if (fit.kind !== "mesh") throw new Error(`expected mesh, got ${fit.kind}`);
  return fit;
}

describe("bodyMesh", () => {
  it("tops: 3 anchor rows give 9 rows x 6 vertices", () => {
    const m = meshOf("Tops", standing());
    expect(m.vertices.length).toBe((2 * STRIPS_PER_SEGMENT + 1) * COLS);
    expect(m.indices.length).toBe(8 * 5 * 6);
    expect(m.texCoords.length).toBe(m.vertices.length);
  });

  it("tops: top row centre is above the shoulders by 12% of torso length", () => {
    const m = meshOf("Tops", standing());
    const cy = (m.vertices[0].y + m.vertices[COLS - 1].y) / 2;
    expect(cy).toBeCloseTo(0.3 - 0.036, 6);
  });

  it("tops: top row half-width is shoulder width x 1.45 / 2", () => {
    const m = meshOf("Tops", standing());
    const half = (m.vertices[COLS - 1].x - m.vertices[0].x) / 2;
    expect(half).toBeCloseTo((0.2 * 1.45) / 2, 6);
  });

  it("tops: hip row is never narrower than 85% of the top row", () => {
    const m = meshOf("Tops", standing({ left_hip: [0.48, 0.6], right_hip: [0.52, 0.6] }));
    const width = (row: number) => m.vertices[row * COLS + COLS - 1].x - m.vertices[row * COLS].x;
    expect(width(8)).toBeGreaterThanOrEqual(width(0) * 0.85 - 1e-9);
  });

  it("rotated shoulders rotate the top row", () => {
    const m = meshOf("Tops", standing({ left_shoulder: [0.4, 0.28], right_shoulder: [0.6, 0.32] }));
    const a = m.vertices[0];
    const b = m.vertices[COLS - 1];
    expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(0.04 / 0.2, 6);
  });

  it("dresses end at the knees", () => {
    const m = meshOf("Dresses", standing());
    const last = m.vertices.slice(-COLS);
    const cy = (last[0].y + last[COLS - 1].y) / 2;
    expect(cy).toBeCloseTo(0.78 + 0.05 * (0.78 - 0.3), 6);
  });

  it("bottoms start at the hips and end at the ankles", () => {
    const m = meshOf("Bottoms", standing());
    expect((m.vertices[0].y + m.vertices[COLS - 1].y) / 2).toBeCloseTo(0.6, 6);
    const last = m.vertices.slice(-COLS);
    expect((last[0].y + last[COLS - 1].y) / 2).toBeCloseTo(0.95 + 0.05 * 0.35, 6);
  });

  it("texCoords span the garment bounds", () => {
    const m = meshOf("Tops", standing(), { x: 0.1, y: 0.2, width: 0.8, height: 0.6 });
    const xs = m.texCoords.map((p) => p.x);
    const ys = m.texCoords.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0.1, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.9, 6);
    expect(Math.min(...ys)).toBeCloseTo(0.2, 6);
    expect(Math.max(...ys)).toBeCloseTo(0.8, 6);
  });

  it.each(["Shoes", null])("%s is unsupported", (category) => {
    expect(bodyMesh(category, standing(), FULL).kind).toBe("unsupported");
  });

  it("isSupportedCategory is case-insensitive", () => {
    expect(isSupportedCategory("Outerwear")).toBe(true);
    expect(isSupportedCategory("bottoms")).toBe(true);
    expect(isSupportedCategory("Bags")).toBe(false);
  });

  it("no_pose when a required joint is under 0.3", () => {
    expect(bodyMesh("Tops", standing({ right_hip: [0.57, 0.6, 0.2] }), FULL).kind).toBe("no_pose");
  });

  it("no_pose when a required joint is missing", () => {
    expect(bodyMesh("Dresses", standing({ left_knee: undefined }), FULL).kind).toBe("no_pose");
  });

  it("no_pose when shoulders are closer than 2% of the frame", () => {
    const kps = standing({ left_shoulder: [0.495, 0.3], right_shoulder: [0.505, 0.3] });
    expect(bodyMesh("Tops", kps, FULL).kind).toBe("no_pose");
  });

  it("no_pose when hips are above shoulders", () => {
    const kps = standing({ left_hip: [0.43, 0.2], right_hip: [0.57, 0.2] });
    expect(bodyMesh("Tops", kps, FULL).kind).toBe("no_pose");
  });
});
