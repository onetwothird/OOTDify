import { garmentKind } from "../bodyMesh";
import { framingHint, mirrorSides } from "../framing";
import type { Keypoint } from "../overlayGeometry";

type Pt = [number, number, number?];

const BASE: Record<string, Pt> = {
  left_shoulder: [0.4, 0.25],
  right_shoulder: [0.6, 0.25],
  left_hip: [0.42, 0.55],
  right_hip: [0.58, 0.55],
  left_knee: [0.43, 0.72],
  right_knee: [0.57, 0.72],
  left_ankle: [0.44, 0.9],
  right_ankle: [0.56, 0.9],
};

function pose(over: Record<string, Pt> = {}): Keypoint[] {
  return Object.entries({ ...BASE, ...over }).map(([name, [x, y, confidence = 0.9]]) => ({ name, x, y, confidence }));
}

function shifted(names: string[], x: number): Keypoint[] {
  return pose(Object.fromEntries(names.map((n) => [n, [x, BASE[n][1]] as Pt])));
}

describe("framingHint", () => {
  it("no_person when nothing is confident", () => {
    const kps = pose().map((k) => ({ ...k, confidence: 0.1 }));
    expect(framingHint(["upper"], kps)).toBe("no_person");
  });

  it("good for a top when shoulders and hips are inside", () => {
    const kps = pose({ left_hip: [0.42, 0.65], right_hip: [0.58, 0.65] });
    expect(framingHint(["upper"], kps)).toBe("good");
  });

  it("step_back for a dress when knees are below the safe zone", () => {
    expect(framingHint(["dress"], pose({ left_knee: [0.43, 0.98], right_knee: [0.57, 0.98] }))).toBe("step_back");
  });

  it("step_back for pants when hips are above and ankles below", () => {
    const kps = pose({
      left_hip: [0.42, 0.01],
      right_hip: [0.58, 0.01],
      left_ankle: [0.44, 0.99],
      right_ankle: [0.56, 0.99],
    });
    expect(framingHint(["bottom"], kps)).toBe("step_back");
  });

  it("move hints use the mirrored preview", () => {
    const names = Object.keys(BASE).filter((n) => /shoulder|hip/.test(n));
    expect(framingHint(["upper"], shifted(names, 0.97))).toBe("move_left");
    expect(framingHint(["upper"], shifted(names, 0.03))).toBe("move_right");
  });

  it("come_closer when the required span is under 0.35", () => {
    const kps = pose({
      left_shoulder: [0.4, 0.4],
      right_shoulder: [0.6, 0.4],
      left_hip: [0.42, 0.62],
      right_hip: [0.58, 0.62],
    });
    expect(framingHint(["upper"], kps)).toBe("come_closer");
  });

  it("missing required joint counts as outside", () => {
    expect(framingHint(["upper"], pose({ left_hip: [0.42, 0.65, 0.1] }))).toBe("step_back");
  });
});

const HEAD: Record<string, Pt> = {
  left_eye: [0.47, 0.12],
  right_eye: [0.53, 0.12],
  left_ear: [0.44, 0.13],
  right_ear: [0.56, 0.13],
};

describe("framingHint for mixed outfits", () => {
  it("needs the union of joints", () => {
    const kps = pose({ ...HEAD, left_ankle: [0.44, 0.98], right_ankle: [0.56, 0.98] });
    expect(framingHint(["hat", "shoes"], kps)).toBe("step_back");
    expect(framingHint(["hat"], kps)).toBe("good");
  });

  it("head-only outfits skip the body-span check", () => {
    const head = Object.entries(HEAD).map(([name, [x, y]]) => ({ name, x, y, confidence: 0.9 }));
    expect(framingHint(["glasses"], head)).toBe("good");
    expect(framingHint(["hat", "earrings"], head)).toBe("good");
  });

  it("a watch needs the elbows and wrists", () => {
    expect(framingHint(["watch"], pose())).toBe("step_back");
  });

  it("empty kinds is good once a person is seen", () => {
    expect(framingHint([], pose())).toBe("good");
  });
});

describe("garmentKind", () => {
  it('maps every category and rejects "constructor"', () => {
    expect(garmentKind("Tops")).toBe("upper");
    expect(garmentKind("outerwear")).toBe("upper");
    expect(garmentKind("DRESSES")).toBe("dress");
    expect(garmentKind("bottoms")).toBe("bottom");
    expect(garmentKind("shoes")).toBeNull();
    expect(garmentKind("constructor")).toBeNull();
    expect(garmentKind(null)).toBeNull();
  });
});

describe("mirrorSides", () => {
  it("swaps left and right and leaves the other hints alone", () => {
    expect(mirrorSides("move_left")).toBe("move_right");
    expect(mirrorSides("move_right")).toBe("move_left");
    expect(mirrorSides("step_back")).toBe("step_back");
    expect(mirrorSides("good")).toBe("good");
  });
});
