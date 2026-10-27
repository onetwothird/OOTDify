// C:\OOTDify\src\features\community\socialService.ts
// Friends, online status and My Day (migration 20261028140000). Every rule
// about who may see what lives in the database policies; these calls only
// ever read and write the signed-in user's own side.
import * as ImagePicker from "expo-image-picker";

import { formFile } from "../../shared/lib/formFile";
import { shrinkForUpload } from "../../shared/lib/shrinkImage";
import { supabase } from "../../shared/lib/supabase";
import { uuid } from "../../shared/lib/uuid";
import {
  presenceOf,
  splitFriendships,
  type PickedStatus,
  type Presence,
  type FriendshipRow,
  type MyDayPostRow,
} from "./social";
import type { DirectoryProfile } from "./types";

export interface Person extends DirectoryProfile {
  presence: Presence;
  /** Last check-in, for "Last active" when they are not around. */
  lastSeenAt: string | null;
}

export interface FriendsOverview {
  me: string;
  rows: FriendshipRow[];
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
}

export interface MyDayViewer {
  profile: DirectoryProfile | null;
  viewerId: string;
  viewedAt: string;
}

async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const id = session?.user?.id;
  if (!id) throw new Error("Sign in to use Community.");
  return id;
}

async function directory(ids: string[]): Promise<Map<string, DirectoryProfile>> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from("community_directory").select("*").in("user_id", unique);
  if (error) throw error;
  return new Map(((data ?? []) as DirectoryProfile[]).map((r) => [r.user_id, r]));
}

interface PresenceRow {
  user_id: string;
  last_seen_at: string;
  status: string;
}

/** Check-in and picked status for each user the policies let us see (friends who share it). */
async function presence(ids: string[]): Promise<Map<string, PresenceRow>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("user_presence")
    .select("user_id,last_seen_at,status")
    .in("user_id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as PresenceRow[]).map((r) => [r.user_id, r]));
}

/** Online first, then idle, do not disturb, offline. */
const PRESENCE_ORDER: Record<Presence, number> = { online: 0, idle: 1, dnd: 2, offline: 3 };

export function displayName(profile: DirectoryProfile | null | undefined): string {
  return profile?.display_name || profile?.first_name || "OOTDify member";
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export async function fetchFriends(): Promise<FriendsOverview> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id,addressee_id,status,created_at")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  if (error) throw error;
  const rows = (data ?? []) as FriendshipRow[];
  const split = splitFriendships(rows, me);
  const [dir, seen] = await Promise.all([
    directory([...split.friends, ...split.incoming, ...split.outgoing]),
    presence(split.friends),
  ]);
  const now = Date.now();
  const person = (id: string): Person => ({
    ...(dir.get(id) ?? { user_id: id, display_name: null, first_name: null, avatar_url: null }),
    presence: presenceOf(seen.get(id)?.last_seen_at, seen.get(id)?.status, now),
    lastSeenAt: seen.get(id)?.last_seen_at ?? null,
  });
  const friends = split.friends.map(person).sort(
    (a, b) =>
      PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] || displayName(a).localeCompare(displayName(b)),
  );
  return {
    me,
    rows,
    friends,
    incoming: split.incoming.map(person),
    outgoing: split.outgoing.map(person),
  };
}

/** People whose name matches, excluding yourself. */
export async function searchPeople(query: string): Promise<DirectoryProfile[]> {
  const me = await requireUserId();
  // Strip characters PostgREST's or() filter treats as syntax.
  const term = query.trim().replace(/[%,()*\\]/g, "");
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from("community_directory")
    .select("*")
    .or(`display_name.ilike.%${term}%,first_name.ilike.%${term}%`)
    .neq("user_id", me)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as DirectoryProfile[];
}

export async function sendFriendRequest(otherId: string): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase.from("friendships").insert({ requester_id: me, addressee_id: otherId });
  if (error) throw error;
}

export async function acceptFriendRequest(requesterId: string): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("requester_id", requesterId)
    .eq("addressee_id", me);
  if (error) throw error;
}

/** Decline, cancel or unfriend: removes the pair's row whichever way it went. */
export async function removeFriendship(otherId: string): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase
    .from("friendships")
    .delete()
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`,
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Online status
// ---------------------------------------------------------------------------

/** Check in. The server stamps the time; show_status is left as it is. */
export async function heartbeat(): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase.from("user_presence").upsert({ user_id: me }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface MyPresence {
  showStatus: boolean;
  status: PickedStatus;
}

export async function fetchMyPresence(): Promise<MyPresence> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from("user_presence")
    .select("show_status,status")
    .eq("user_id", me)
    .maybeSingle();
  if (error) throw error;
  const row = data as { show_status: boolean; status: PickedStatus } | null;
  return { showStatus: row?.show_status ?? true, status: row?.status ?? "online" };
}

/** Online, idle or do not disturb. Do not disturb also holds back phone push. */
export async function setMyStatus(status: PickedStatus): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase.from("user_presence").upsert({ user_id: me, status }, { onConflict: "user_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// My Day
// ---------------------------------------------------------------------------

export interface MyDayFeed {
  me: string;
  posts: MyDayPostRow[];
  viewed: Set<string>;
  profiles: Map<string, DirectoryProfile>;
}

/** Your own live posts plus your friends' (the policies do the filtering). */
export async function fetchMyDay(): Promise<MyDayFeed> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from("my_day_posts")
    .select("id,user_id,image_ref,caption,created_at,expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  const posts = (data ?? []) as MyDayPostRow[];
  const others = posts.filter((p) => p.user_id !== me).map((p) => p.id);
  const [views, profiles] = await Promise.all([
    others.length
      ? supabase.from("my_day_views").select("post_id").eq("viewer_id", me).in("post_id", others)
      : Promise.resolve({ data: [], error: null }),
    directory([me, ...posts.map((p) => p.user_id)]),
  ]);
  if (views.error) throw views.error;
  const viewed = new Set(((views.data ?? []) as { post_id: string }[]).map((v) => v.post_id));
  return { me, posts, viewed, profiles };
}

/** Pick a tall photo from the gallery or camera. Null when cancelled or denied. */
export async function pickMyDayPhoto(source: "camera" | "library"): Promise<string | null> {
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: true,
    aspect: [9, 16],
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  return result.assets?.[0]?.uri ?? null;
}

export async function postMyDay(photoUri: string, caption: string): Promise<void> {
  const me = await requireUserId();
  const small = await shrinkForUpload(photoUri);
  const path = `${me}/${uuid()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("myday")
    .upload(path, formFile(small), { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;
  const text = caption.trim().slice(0, 200);
  const { error } = await supabase
    .from("my_day_posts")
    .insert({ user_id: me, image_ref: `myday/${path}`, caption: text || null });
  if (error) {
    // Don't leave an orphaned photo behind when the post itself was refused.
    await supabase.storage.from("myday").remove([path]);
    throw error;
  }
}

export async function deleteMyDay(post: MyDayPostRow): Promise<void> {
  const { error } = await supabase.from("my_day_posts").delete().eq("id", post.id);
  if (error) throw error;
  const path = post.image_ref.replace(/^myday\//, "");
  await supabase.storage.from("myday").remove([path]);
}

/** Record that you saw a friend's post. Seeing it twice changes nothing. */
export async function markMyDayViewed(postId: string): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase
    .from("my_day_views")
    .upsert({ post_id: postId, viewer_id: me }, { onConflict: "post_id,viewer_id", ignoreDuplicates: true });
  if (error) throw error;
}

/** Who has seen one of your posts, most recent first. */
export async function fetchMyDayViewers(postId: string): Promise<MyDayViewer[]> {
  const { data, error } = await supabase
    .from("my_day_views")
    .select("viewer_id,viewed_at")
    .eq("post_id", postId)
    .order("viewed_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as { viewer_id: string; viewed_at: string }[];
  const dir = await directory(rows.map((r) => r.viewer_id));
  return rows.map((r) => ({ viewerId: r.viewer_id, viewedAt: r.viewed_at, profile: dir.get(r.viewer_id) ?? null }));
}

// ---------------------------------------------------------------------------
// My Day hearts and comments (only you and the post's owner see them)
// ---------------------------------------------------------------------------

/** Which of these posts you have hearted. */
export async function fetchMyHearts(postIds: string[]): Promise<Set<string>> {
  const me = await requireUserId();
  if (!postIds.length) return new Set();
  const { data, error } = await supabase
    .from("my_day_reactions")
    .select("post_id")
    .eq("user_id", me)
    .in("post_id", postIds);
  if (error) throw error;
  return new Set(((data ?? []) as { post_id: string }[]).map((r) => r.post_id));
}

export async function setMyDayHeart(postId: string, hearted: boolean): Promise<void> {
  const me = await requireUserId();
  const { error } = hearted
    ? await supabase
        .from("my_day_reactions")
        .upsert({ post_id: postId, user_id: me }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : await supabase.from("my_day_reactions").delete().eq("post_id", postId).eq("user_id", me);
  if (error) throw error;
}

export async function sendMyDayComment(postId: string, body: string): Promise<void> {
  const me = await requireUserId();
  const text = body.trim().slice(0, 300);
  if (!text) return;
  const { error } = await supabase.from("my_day_comments").insert({ post_id: postId, user_id: me, body: text });
  if (error) throw error;
}

export interface MyDayComment {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  profile: DirectoryProfile | null;
}

export interface MyDayActivity {
  viewers: MyDayViewer[];
  hearts: Set<string>;
  comments: MyDayComment[];
}

/** Everything friends did with one of your posts: who saw it, hearted it, and said what. */
export async function fetchMyDayActivity(postId: string): Promise<MyDayActivity> {
  const [viewers, hearts, comments] = await Promise.all([
    fetchMyDayViewers(postId),
    supabase.from("my_day_reactions").select("user_id").eq("post_id", postId),
    supabase
      .from("my_day_comments")
      .select("id,user_id,body,created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  ]);
  if (hearts.error) throw hearts.error;
  if (comments.error) throw comments.error;
  const rows = (comments.data ?? []) as { id: string; user_id: string; body: string; created_at: string }[];
  const dir = await directory(rows.map((r) => r.user_id));
  return {
    viewers,
    hearts: new Set(((hearts.data ?? []) as { user_id: string }[]).map((r) => r.user_id)),
    comments: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      body: r.body,
      createdAt: r.created_at,
      profile: dir.get(r.user_id) ?? null,
    })),
  };
}
