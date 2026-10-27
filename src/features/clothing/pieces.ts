// Saved outfits store piece ids. New ones are the user's closet items; older
// ones may be stock catalog items (from before the app went closet-only).
// These helpers put the two together without supabase so they're testable.

export interface OutfitPiece {
  id: string;
  name: string | null;
  category: string | null;
  image_url: string | null;
  source: "closet" | "catalog";
}

/** Pieces in saved order; the closet wins on a shared id; unknown ids drop out. */
export function orderPieces(ids: string[], closet: OutfitPiece[], catalog: OutfitPiece[]): OutfitPiece[] {
  const byId = new Map<string, OutfitPiece>();
  for (const p of catalog) byId.set(p.id, p);
  for (const p of closet) byId.set(p.id, p);
  return ids.map((id) => byId.get(id)).filter((p): p is OutfitPiece => !!p);
}

/** Where a piece opens: the closet item page, or the legacy product page. */
export function pieceHref(piece: Pick<OutfitPiece, "id" | "source">): `/item/${string}` | `/catalog/${string}` {
  return piece.source === "closet" ? `/item/${piece.id}` : `/catalog/${piece.id}`;
}
