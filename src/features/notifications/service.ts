// C:\OOTDify\src\features\notifications\service.ts
// The notifications inbox, its settings, and phone push registration
// (migration 20261028150000). The database writes every notification and
// sends the push; the app only reads its own rows, marks them read, and
// tells the database where to reach this phone.
import Constants from "expo-constants";
import { Platform } from "react-native";

import { supabase } from "../../shared/lib/supabase";
import type { DirectoryProfile } from "../community/types";
import type { InboxRow } from "./inbox";
import { nativePush } from "./nativePush";

export interface InboxEntryRow extends InboxRow {
  actor: DirectoryProfile | null;
  roomTitle: string | null;
}

export interface NotificationSettings {
  messages: boolean;
  group_chats: boolean;
  friends: boolean;
  posts: boolean;
  my_day: boolean;
  communities: boolean;
  quiet_start: number | null;
  quiet_end: number | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  messages: true,
  group_chats: true,
  friends: true,
  posts: true,
  my_day: true,
  communities: true,
  quiet_start: null,
  quiet_end: null,
};

const COLUMNS = "id,type,actor_id,conversation_id,post_id,my_day_post_id,preview,read_at,created_at";

async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const id = session?.user?.id;
  if (!id) throw new Error("Sign in to see notifications.");
  return id;
}

/** Latest notifications with who did it and, for chats, the room's name. */
export async function fetchInbox(limit = 80): Promise<InboxEntryRow[]> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from("notifications")
    .select(COLUMNS)
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as InboxRow[];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x))));
  const convIds = Array.from(new Set(rows.map((r) => r.conversation_id).filter((x): x is string => Boolean(x))));
  const [actors, rooms] = await Promise.all([
    actorIds.length
      ? supabase.from("community_directory").select("*").in("user_id", actorIds)
      : Promise.resolve({ data: [], error: null }),
    convIds.length
      ? supabase.from("conversations").select("id,title").in("id", convIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (actors.error) throw actors.error;
  // A room you have left can no longer be read; it just loses its name.
  const actorMap = new Map(((actors.data ?? []) as DirectoryProfile[]).map((a) => [a.user_id, a]));
  const roomMap = new Map(
    ((rooms.data ?? []) as { id: string; title: string | null }[]).map((r) => [r.id, r.title]),
  );
  return rows.map((r) => ({
    ...r,
    actor: r.actor_id ? (actorMap.get(r.actor_id) ?? null) : null,
    roomTitle: r.conversation_id ? (roomMap.get(r.conversation_id) ?? null) : null,
  }));
}

export async function fetchUnreadCount(): Promise<number> {
  const me = await requireUserId();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", me)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", me)
    .is("read_at", null);
  if (error) throw error;
}

/** Messages in a chat count as read once the chat is opened. */
export async function markChatRead(conversationId: string): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", me)
    .eq("conversation_id", conversationId)
    .eq("type", "message")
    .is("read_at", null);
  if (error) throw error;
}

export async function clearInbox(): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase.from("notifications").delete().eq("user_id", me);
  if (error) throw error;
}

/** New rows for this user, the moment the database writes them. */
export function subscribeToInbox(userId: string, onInsert: (row: InboxRow) => void): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new as InboxRow),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("messages,group_chats,friends,posts,my_day,communities,quiet_start,quiet_end")
    .eq("user_id", me)
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...((data as Partial<NotificationSettings> | null) ?? {}) };
}

export async function saveNotificationSettings(patch: Partial<NotificationSettings>): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: me, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * Push text is written by the database, so it needs this phone's language
 * and time zone (for quiet hours). Sent on every app start.
 */
export async function syncDeviceContext(language: "en" | "fil"): Promise<void> {
  const me = await requireUserId();
  const { error } = await supabase.from("notification_settings").upsert(
    {
      user_id: me,
      language,
      utc_offset_minutes: -new Date().getTimezoneOffset(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Phone push
// ---------------------------------------------------------------------------

export type PushSetup = "ready" | "denied" | "unsupported" | "no-project";

let registeredToken: string | null = null;

/** The EAS project id Expo push needs; absent until `eas init` has been run. */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/**
 * Asks for permission (once; the OS remembers the answer), creates the
 * Android channel, and registers this phone's Expo push token for the
 * signed-in user. The inbox works whatever this returns.
 */
export async function registerForPush(): Promise<PushSetup> {
  const Notifications = nativePush();
  if (!Notifications) return "unsupported";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "OOTDify",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#3A5A96",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return "denied";

  const id = projectId();
  if (!id) return "no-project";
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await supabase.rpc("register_push_token", {
    p_token: token,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
  });
  if (error) throw error;
  registeredToken = token;
  return "ready";
}

/** Before signing out: stop sending this account's notifications to this phone. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await supabase.from("push_tokens").delete().eq("token", registeredToken);
  registeredToken = null;
}
