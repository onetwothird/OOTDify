// C:\OOTDify\src\features\profile\names.ts
// Names on the profile. Sign-up keeps the person's name in the account's
// metadata (email sign-up: full_name; Google: given_name / family_name /
// name), not in the profile row, so Edit profile reads it from there until
// the user saves their own. The nickname is the short name shown in the app.

/** The nickname's length, in characters (an emoji counts as one). */
export const NICKNAME_MAX = 8;

const str = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function namesFromMetadata(meta: Record<string, unknown> | null | undefined): { first: string; last: string } {
  const given = str(meta?.given_name);
  const family = str(meta?.family_name);
  if (given || family) return { first: given, last: family };
  const full = str(meta?.full_name) || str(meta?.name);
  if (!full) return { first: "", last: "" };
  const words = full.split(" ");
  if (words.length === 1) return { first: full, last: "" };
  return { first: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}

export function clampNickname(value: string): string {
  return Array.from(value.trim()).slice(0, NICKNAME_MAX).join("").trim();
}
