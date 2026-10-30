// How Discover orders shared looks: the hot score behind Trending, the "Look
// of the week" spotlight, the top-creators row and the two-column wall. Pure,
// so every rule is unit-tested; the screen only fetches and renders.

/** The community_posts fields Discover ranks on. */
export interface Look {
  id: string;
  user_id: string;
  /** Set when the post was shared from a saved outfit: only those are Discover looks. */
  saved_outfit_id: string | null;
  image_urls: string[];
  like_count: number;
  comment_count: number;
  created_at: string;
}

export type LookSort = "trending" | "new" | "friends";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SPOTLIGHT_WINDOW_MS = 7 * DAY_MS;
const CREATORS_WINDOW_MS = 30 * DAY_MS;
/** Card heights, as a share of the column width: a single image is 4:5, a piece grid 1:1. */
const SINGLE_HEIGHT = 1.25;
const GRID_HEIGHT = 1;

const age = (look: Look, now: number) => now - Date.parse(look.created_at);
const newestFirst = (a: Look, b: Look) => Date.parse(b.created_at) - Date.parse(a.created_at);
const hasImages = (look: Look) => look.image_urls.length > 0;

/**
 * Discover is the outfit lookbook, not a second Community feed: only posts
 * shared from a saved outfit, with at least one image. Captions, photo dumps
 * and text posts stay in Community.
 */
export function outfitLooks<T extends Look>(posts: T[]): T[] {
  return posts.filter((p) => p.saved_outfit_id !== null && hasImages(p));
}

/** Trending score: engagement over age, so a new look with a few likes beats an old one. */
export function hotScore(look: Look, now: number): number {
  const ageHours = Math.max(0, age(look, now)) / HOUR_MS;
  return (look.like_count + 2 * look.comment_count + 1) / Math.pow(ageHours + 2, 1.5);
}

/** The wall for a sort: looks with at least one image, in that sort's order. */
export function sortLooks<T extends Look>(looks: T[], sort: LookSort, now: number, friendIds: ReadonlySet<string>): T[] {
  const shown = looks.filter(hasImages);
  if (sort === "trending") return [...shown].sort((a, b) => hotScore(b, now) - hotScore(a, now));
  if (sort === "friends") return shown.filter((l) => friendIds.has(l.user_id)).sort(newestFirst);
  return [...shown].sort(newestFirst);
}

/** The most-liked look (likes + comments) with images from the last 7 days; null when none has any. */
export function lookOfTheWeek<T extends Look>(looks: T[], now: number): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const look of looks) {
    if (!hasImages(look) || age(look, now) > SPOTLIGHT_WINDOW_MS) continue;
    const score = look.like_count + look.comment_count;
    if (score > bestScore) {
      best = look;
      bestScore = score;
    }
  }
  return best;
}

export interface Creator {
  userId: string;
  /** Likes their looks received in the last 30 days. */
  likes: number;
  looks: number;
}

/** Authors ranked by likes received in the last 30 days; authors with no likes are left out. */
export function topCreators(looks: Look[], now: number, limit: number): Creator[] {
  const byUser = new Map<string, Creator>();
  for (const look of looks) {
    if (age(look, now) > CREATORS_WINDOW_MS) continue;
    const c = byUser.get(look.user_id) ?? { userId: look.user_id, likes: 0, looks: 0 };
    c.likes += look.like_count;
    c.looks += 1;
    byUser.set(look.user_id, c);
  }
  return [...byUser.values()]
    .filter((c) => c.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit);
}

/** Card height in column widths: a single image or a piece grid. */
export function cardHeight(look: Look): number {
  return look.image_urls.length > 1 ? GRID_HEIGHT : SINGLE_HEIGHT;
}

/** The staggered wall: each look goes to whichever column is shorter so far (left on a tie). */
export function splitColumns<T extends Look>(looks: T[]): [T[], T[]] {
  const left: T[] = [];
  const right: T[] = [];
  let lh = 0;
  let rh = 0;
  for (const look of looks) {
    if (lh <= rh) {
      left.push(look);
      lh += cardHeight(look);
    } else {
      right.push(look);
      rh += cardHeight(look);
    }
  }
  return [left, right];
}
