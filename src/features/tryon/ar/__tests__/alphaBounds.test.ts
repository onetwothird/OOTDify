import { alphaBounds } from "../alphaBounds";

function image(width: number, height: number, fill: (x: number, y: number) => number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba[(y * width + x) * 4 + 3] = fill(x, y);
  }
  return rgba;
}

describe("alphaBounds", () => {
  it("finds an inset opaque box", () => {
    const rgba = image(10, 10, (x, y) => (x >= 2 && x <= 7 && y >= 1 && y <= 8 ? 255 : 0));
    const b = alphaBounds(rgba, 10, 10);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.1);
    expect(b.width).toBeCloseTo(0.6);
    expect(b.height).toBeCloseTo(0.8);
  });

  it("ignores near-transparent fringe", () => {
    const rgba = image(10, 10, (x, y) => (x >= 2 && x <= 7 && y >= 1 && y <= 8 ? 255 : 10));
    const b = alphaBounds(rgba, 10, 10);
    expect(b).toEqual({ x: 0.2, y: 0.1, width: 0.6, height: 0.8 });
  });

  it("returns full bounds when fully transparent", () => {
    expect(alphaBounds(new Uint8ClampedArray(10 * 10 * 4), 10, 10)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});
