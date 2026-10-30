// What Penggi says on Home, built from what is really true right now: the
// closet and saved-look counts, the time of day, the change you just made
// (penggiNotes.ts) and looks your friends just shared on Discover. News (a
// fresh change or a friend's look) is said first; otherwise Penggi says hello,
// then loops through the rest. Pure, so tested.
import type { TranslationKey } from "../../shared/i18n/translate";
import type { PenggiNote } from "./penggiNotes";

/** A change counts as news for this long after it was made. */
export const NOTE_FRESH_MS = 30 * 60 * 1000;

export interface FriendLook {
  postId: string;
  userId: string;
  name: string;
  at: string;
}

export interface PenggiContext {
  pieceCount: number;
  lookCount: number;
  note: PenggiNote | null;
  /** Friends' recent looks, newest first. */
  friendLooks: FriendLook[];
  now: number;
  hour: number;
}

export interface PenggiLine {
  id: string;
  key: TranslationKey;
  params?: Record<string, string | number>;
  /** Part of the line drawn bold (a friend's name). */
  highlight?: string;
  /** Where tapping "go" on the line leads. */
  route?: "discover" | "capture" | "wardrobe";
  tip?: boolean;
}

function noteLine(note: PenggiNote): PenggiLine {
  const id = `note:${note.id}`;
  switch (note.kind) {
    case "piece_added":
      return note.value
        ? { id, key: "home.penggi.note.piece_added", params: { name: note.value } }
        : { id, key: "home.penggi.note.piece_added_unnamed" };
    case "look_saved":
      return { id, key: "home.penggi.note.look_saved" };
    case "profile_updated":
      return { id, key: "home.penggi.note.profile_updated" };
    default:
      // Settings: one line per setting and value, e.g. note.appearance.dark.
      return { id, key: `home.penggi.note.${note.kind}.${note.value}` as TranslationKey };
  }
}

export function penggiLines(ctx: PenggiContext): { news: PenggiLine[]; intro: PenggiLine | null; loop: PenggiLine[] } {
  const news: PenggiLine[] = [];
  if (ctx.note && ctx.now - ctx.note.at <= NOTE_FRESH_MS) news.push(noteLine(ctx.note));
  for (const look of ctx.friendLooks) {
    news.push({
      id: `friend:${look.postId}`,
      key: "home.penggi.friend_look",
      params: { name: look.name },
      highlight: look.name,
      route: "discover",
    });
  }

  const loop: PenggiLine[] = [];
  const timeKey: TranslationKey =
    ctx.hour < 12 ? "home.penggi.morning" : ctx.hour < 17 ? "home.penggi.afternoon" : "home.penggi.evening";
  loop.push({ id: "time", key: timeKey });

  if (ctx.pieceCount === 0) loop.push({ id: "closet", key: "home.penggi.closet_empty", route: "capture", tip: true });
  else if (ctx.pieceCount < 5) loop.push({ id: "closet", key: "home.penggi.closet_few", params: { count: ctx.pieceCount }, tip: true });
  else loop.push({ id: "closet", key: "home.penggi.closet_many", params: { count: ctx.pieceCount } });

  loop.push({ id: "tryon", key: "home.penggi.tip_tryon", tip: true });

  if (ctx.lookCount === 0) loop.push({ id: "looks", key: "home.penggi.looks_none", route: "wardrobe", tip: true });
  else loop.push({ id: "looks", key: "home.penggi.looks_some", params: { count: ctx.lookCount } });

  loop.push({ id: "calendar", key: "home.penggi.tip_calendar", route: "wardrobe", tip: true });
  loop.push({ id: "tuxedo", key: "home.penggi.tuxedo" });
  loop.push({ id: "discover", key: "home.penggi.tip_discover", route: "discover", tip: true });

  return { news, intro: news.length ? null : { id: "welcome", key: "home.penggi.welcome" }, loop };
}
