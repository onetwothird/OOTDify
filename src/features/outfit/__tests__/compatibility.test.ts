import { scoreOutfit } from "../compatibility";

const make = (n: number) =>
  ({ items: new Array(n).fill({ category: "Tops" }) }) as any;

describe("scoreOutfit", () => {
  test("scores between 0 and 100", () => {
    const s = scoreOutfit(make(3));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
