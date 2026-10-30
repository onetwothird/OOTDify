// Blends two 6-digit hex colours. Theme colours stay opaque hex, so tints are
// made by mixing one token into another rather than with rgba(). Pure, so tested.

/** `a` blended towards `b` by `amount` (0 = a, 1 = b), as "#RRGGBB". */
export function mixHex(a: string, b: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const v = Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t);
    out += v.toString(16).padStart(2, "0").toUpperCase();
  }
  return out;
}
