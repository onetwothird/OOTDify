// Paging for Discover: public pieces load from the database a page at a time;
// looks are already loaded and are revealed a page at a time. Pure.

/** Rows fetched with one extra: the page itself and whether another exists. */
export function pageOf<T>(rows: T[], size: number): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}

/** The next page appended, skipping rows already shown (new uploads shift pages). */
export function appendPage<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((r) => r.id));
  return [...shown, ...page.filter((r) => !seen.has(r.id))];
}

/** The next page of pieces for range(from, to). It is inclusive, so this asks for one extra row (see pageOf). */
export function morePieces(shown: number, size: number): { from: number; to: number } {
  return { from: shown, to: shown + size };
}

/** How many looks to show after "more": one page further, never past the end. */
export function showMore(shown: number, total: number, size: number): number {
  return Math.min(total, shown + size);
}
