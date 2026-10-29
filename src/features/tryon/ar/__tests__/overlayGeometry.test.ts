import { pointToPreview } from "../overlayGeometry";

describe("pointToPreview", () => {
  // photo 3:4 (300x400) into preview 300x600 -> cover scale 1.5, offsetX -75, offsetY 0
  const photo = { width: 300, height: 400 };
  const preview = { width: 300, height: 600 };

  it("maps with a cover crop", () => {
    expect(pointToPreview({ x: 0.5, y: 0.5 }, photo, preview, false)).toEqual({ x: 150, y: 300 });
  });

  it("maps and mirrors a point", () => {
    expect(pointToPreview({ x: 0.25, y: 0.5 }, photo, preview, true)).toEqual({ x: 262.5, y: 300 });
  });

  it("letterboxes vertically when the preview is wider", () => {
    // photo 400x300 into 300x600 -> scale 2, scaled 800x600, offsetX -250
    expect(pointToPreview({ x: 0.5, y: 0.5 }, { width: 400, height: 300 }, preview, false)).toEqual({
      x: 150,
      y: 300,
    });
  });
});
