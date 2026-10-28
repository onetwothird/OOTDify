// C:\OOTDify\src\features\community\components\FriendsPanel.tsx
// The Friends tab of Community: your own status (online, idle, do not
// disturb), friend requests, your friends with a status dot on their photo,
// and finding people by name. Tapping a friend opens their card, from which
// you can message them privately or unfriend them.
//
// Everyone picks Online, Idle or Do not disturb. A friend's dot shows that
// choice while they are using the app; once they stop, the dot goes and
// "Last active" says when they were last around.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { AppButton } from "../../../shared/components/AppButton";
import { ConfirmSheet } from "../../../shared/components/ConfirmSheet";
import { Sheet } from "../../../shared/components/Sheet";
import { EmptyState, ErrorState } from "../../../shared/components/StateViews";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import type { TranslationKey } from "../../../shared/i18n/translate";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useAvatarStore } from "../../profile/avatarStore";
import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { timeAgo } from "../format";
import { communityErrorMessage, fetchConversations, startDirectConversation } from "../service";
import { dmsByFriend, friendStateWith, type FriendState, type PickedStatus, type Presence } from "../social";
import {
  acceptFriendRequest,
  displayName,
  fetchFriends,
  fetchMyPresence,
  removeFriendship,
  searchPeople,
  sendFriendRequest,
  setMyStatus,
  type FriendsOverview,
  type Person,
} from "../socialService";
import type { ConversationListEntry, DirectoryProfile } from "../types";
import { FlyingPreloader } from "../../../shared/components/FlyingPreloader";

const PICKABLE: { key: PickedStatus; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "online", icon: "ellipse" },
  { key: "idle", icon: "moon" },
  { key: "dnd", icon: "remove-circle" },
];

export function presenceColor(theme: Theme, presence: Presence): string {
  if (presence === "online") return theme.colors.success;
  if (presence === "idle") return theme.colors.warning;
  if (presence === "dnd") return theme.colors.danger;
  return theme.colors.textMuted;
}

export function FriendsPanel({
  bottomSpace,
  onScroll,
}: {
  bottomSpace: number;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const myAvatar = useAvatarStore((s) => s.ref);

  const [data, setData] = useState<FriendsOverview | null>(null);
  // Your private chat with each friend, for the unread badge on Message.
  const [chats, setChats] = useState<Map<string, ConversationListEntry>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryProfile[] | null>(null);
  const [myStatus, setMyStatusState] = useState<PickedStatus>("online");
  const [statusOpen, setStatusOpen] = useState(false);
  const [openFriend, setOpenFriend] = useState<Person | null>(null);
  const [unfriending, setUnfriending] = useState<Person | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchFriends());
      setError(null);
      // The badge is a nicety: a failure here must not hide the friends list.
      void fetchConversations()
        .then((rows) => setChats(dmsByFriend(rows)))
        .catch(() => {});
    } catch (e) {
      setError(communityErrorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void fetchMyPresence()
        .then((p) => setMyStatusState(p.status))
        .catch(() => {});
    }, [load]),
  );

  // Status dots go stale while the tab sits open; refresh them every minute.
  useEffect(() => {
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Search as you type, once the name has two letters, after a short pause.
  const searching = query.trim().length >= 2;
  useEffect(() => {
    if (!searching) return;
    let alive = true;
    const id = setTimeout(() => {
      void searchPeople(query)
        .then((rows) => alive && setResults(rows))
        .catch(() => alive && setResults([]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [query, searching]);

  const run = async (id: string, action: () => Promise<void>, done?: string) => {
    setBusyId(id);
    try {
      await action();
      if (done) toast.success(done);
      await load();
      return true;
    } catch (e) {
      toast.error(t("friends.toast.error"), communityErrorMessage(e));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const message = async (person: DirectoryProfile) => {
    setBusyId(person.user_id);
    try {
      const id = await startDirectConversation(person.user_id);
      setOpenFriend(null);
      router.push(`/community/chat/${id}`);
    } catch (e) {
      toast.error(t("community.toast.chat_error.title"), communityErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const pickStatus = (status: PickedStatus) => {
    const before = myStatus;
    setMyStatusState(status);
    setStatusOpen(false);
    void setMyStatus(status).catch((e) => {
      setMyStatusState(before);
      toast.error(t("friends.toast.error"), communityErrorMessage(e));
    });
  };

  const stateOf = (id: string): FriendState => (data ? friendStateWith(data.rows, data.me, id) : "none");

  /** The one action a search result offers, by where you stand with them. */
  const searchAction = (person: DirectoryProfile) => {
    const id = person.user_id;
    const state = stateOf(id);
    if (state === "friends") {
      return (
        <IconButton
          icon="chatbubble-ellipses-outline"
          label={t("friends.message")}
          busy={busyId === id}
          badge={chats.get(id)?.unread}
          onPress={() => void message(person)}
        />
      );
    }
    if (state === "outgoing") {
      return (
        <SmallButton
          label={t("friends.state.requested")}
          tone="soft"
          busy={busyId === id}
          onPress={() => void run(id, () => removeFriendship(id))}
        />
      );
    }
    if (state === "incoming") {
      return (
        <SmallButton
          label={t("friends.accept")}
          busy={busyId === id}
          onPress={() => void run(id, () => acceptFriendRequest(id), t("friends.toast.accepted"))}
        />
      );
    }
    return (
      <SmallButton
        label={t("friends.add")}
        icon="person-add-outline"
        busy={busyId === id}
        onPress={() => void run(id, () => sendFriendRequest(id), t("friends.toast.sent"))}
      />
    );
  };

  const online = data?.friends.filter((f) => f.presence !== "offline").length ?? 0;
  const presenceLabel = (p: PickedStatus) => t(`presence.${p}` as TranslationKey);
  /** Their status while around, otherwise when they were last seen (if ever). */
  const friendHint = (f: Person) =>
    f.presence !== "offline"
      ? presenceLabel(f.presence)
      : f.lastSeenAt
        ? t("presence.last_active", { time: timeAgo(f.lastSeenAt) })
        : undefined;

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={theme.colors.brand}
          />
        }
      >
        {/* Your own status, set here and shown to friends as your dot. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("presence.yours_a11y", { status: presenceLabel(myStatus) })}
          onPress={() => setStatusOpen(true)}
          style={({ pressed }) => [styles.me, pressed && { opacity: 0.85 }]}
        >
          <View>
            <ProfileAvatar size={42} initial="" avatarRef={myAvatar} />
            <StatusDot presence={myStatus} ring={theme.colors.surface} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.meLabel}>{t("presence.yours")}</Text>
            <Text style={[styles.meStatus, { color: presenceColor(theme, myStatus) }]}>{presenceLabel(myStatus)}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
        </Pressable>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("friends.search.placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {searching ? (
          <Section title={t("friends.search.results")}>
            {results === null ? (
              <FlyingPreloader size={88} style={styles.loading} />
            ) : results.length === 0 ? (
              <Text style={styles.muted}>{t("friends.search.none")}</Text>
            ) : (
              results.map((p) => <PersonRow key={p.user_id} person={p} right={searchAction(p)} />)
            )}
          </Section>
        ) : data === null && !error ? (
          <FlyingPreloader size={88} style={styles.loading} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : data ? (
          <>
            {data.incoming.length > 0 ? (
              <Section title={t("friends.requests", { count: data.incoming.length })}>
                {data.incoming.map((p) => (
                  <PersonRow
                    key={p.user_id}
                    person={p}
                    hint={t("friends.requests.hint")}
                    right={
                      <View style={styles.actions}>
                        <SmallButton
                          label={t("friends.accept")}
                          busy={busyId === p.user_id}
                          onPress={() =>
                            void run(p.user_id, () => acceptFriendRequest(p.user_id), t("friends.toast.accepted"))
                          }
                        />
                        <SmallButton
                          label={t("friends.decline")}
                          tone="soft"
                          onPress={() => void run(p.user_id, () => removeFriendship(p.user_id))}
                        />
                      </View>
                    }
                  />
                ))}
              </Section>
            ) : null}

            <Section
              title={t("friends.list", { count: data.friends.length })}
              aside={data.friends.length ? t("friends.online_count", { count: online }) : undefined}
            >
              {data.friends.length === 0 ? (
                <EmptyState
                  compact
                  icon="people-outline"
                  title={t("friends.empty.title")}
                  message={t("friends.empty.message")}
                />
              ) : (
                data.friends.map((p) => (
                  <PersonRow
                    key={p.user_id}
                    person={p}
                    presence={p.presence}
                    hint={friendHint(p)}
                    onPress={() => setOpenFriend(p)}
                    right={
                      <IconButton
                        icon="chatbubble-ellipses-outline"
                        label={t("friends.message")}
                        busy={busyId === p.user_id}
                        badge={chats.get(p.user_id)?.unread}
                        onPress={() => void message(p)}
                      />
                    }
                  />
                ))
              )}
            </Section>

            {data.outgoing.length > 0 ? (
              <Section title={t("friends.sent")}>
                {data.outgoing.map((p) => (
                  <PersonRow
                    key={p.user_id}
                    person={p}
                    hint={t("friends.sent.hint")}
                    right={
                      <SmallButton
                        label={t("common.cancel")}
                        tone="soft"
                        busy={busyId === p.user_id}
                        onPress={() => void run(p.user_id, () => removeFriendship(p.user_id))}
                      />
                    }
                  />
                ))}
              </Section>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* ------------------------------------------------ Your status */}
      <Sheet
        visible={statusOpen}
        onClose={() => setStatusOpen(false)}
        icon="radio-button-on-outline"
        title={t("presence.pick.title")}
        subtitle={t("presence.pick.subtitle")}
        scroll={false}
      >
        <View style={styles.statusList}>
          {PICKABLE.map((s) => {
            const active = s.key === myStatus;
            const color = presenceColor(theme, s.key);
            return (
              <Pressable
                key={s.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => pickStatus(s.key)}
                style={({ pressed }) => [styles.statusRow, active && styles.statusRowActive, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.statusIcon, { borderColor: color }]}>
                  <Ionicons name={s.icon} size={16} color={color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{presenceLabel(s.key)}</Text>
                  <Text style={styles.rowHint}>{t(`presence.${s.key}.hint` as TranslationKey)}</Text>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* ------------------------------------------------ A friend's card */}
      <Sheet
        visible={openFriend !== null}
        onClose={() => setOpenFriend(null)}
        icon="person-outline"
        title={openFriend ? displayName(openFriend) : ""}
        scroll={false}
        footer={
          openFriend ? (
            <View style={styles.cardActions}>
              <AppButton
                label={t("friends.view_profile")}
                icon="person-circle-outline"
                onPress={() => {
                  const id = openFriend.user_id;
                  setOpenFriend(null);
                  router.push({ pathname: "/community/profile/[userId]", params: { userId: id } });
                }}
              />
              <AppButton
                label={t("friends.message_private")}
                icon="chatbubble-ellipses-outline"
                variant="ghost"
                loading={busyId === openFriend.user_id}
                onPress={() => void message(openFriend)}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const f = openFriend;
                  setOpenFriend(null);
                  setUnfriending(f);
                }}
                style={({ pressed }) => [styles.unfriendBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="person-remove-outline" size={17} color={theme.colors.danger} />
                <Text style={styles.unfriendText}>{t("friends.unfriend.confirm")}</Text>
              </Pressable>
            </View>
          ) : undefined
        }
      >
        {openFriend ? (
          <View style={styles.card}>
            <View>
              <ProfileAvatar
                size={88}
                initial={(displayName(openFriend)[0] ?? "?").toUpperCase()}
                avatarRef={openFriend.avatar_url}
              />
              <StatusDot presence={openFriend.presence} ring={theme.colors.surface} size={22} />
            </View>
            {friendHint(openFriend) ? (
              <View style={[styles.presencePill, { borderColor: presenceColor(theme, openFriend.presence) }]}>
                {openFriend.presence !== "offline" ? (
                  <View style={[styles.pillDot, { backgroundColor: presenceColor(theme, openFriend.presence) }]} />
                ) : null}
                <Text style={styles.presencePillText}>{friendHint(openFriend)}</Text>
              </View>
            ) : null}
            {openFriend.presence === "dnd" ? (
              <Text style={styles.cardNote}>{t("presence.dnd.friend_note")}</Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      {/* ------------------------------------------------ Unfriend */}
      <ConfirmSheet
        visible={unfriending !== null}
        onClose={() => setUnfriending(null)}
        icon="person-remove-outline"
        title={unfriending ? t("friends.unfriend.title", { name: displayName(unfriending) }) : ""}
        message={t("friends.unfriend.message")}
        confirmLabel={t("friends.unfriend.confirm")}
        cancelLabel={t("friends.unfriend.keep")}
        busy={unfriending !== null && busyId === unfriending.user_id}
        hero={
          unfriending ? (
            <View style={styles.unfriendHero}>
              <ProfileAvatar size={64} initial="" avatarRef={myAvatar} />
              <View style={styles.breakIcon}>
                <Ionicons name="heart-dislike" size={16} color={theme.colors.danger} />
              </View>
              <ProfileAvatar
                size={64}
                initial={(displayName(unfriending)[0] ?? "?").toUpperCase()}
                avatarRef={unfriending.avatar_url}
              />
            </View>
          ) : undefined
        }
        onConfirm={() => {
          if (!unfriending) return;
          const f = unfriending;
          void run(f.user_id, () => removeFriendship(f.user_id), t("friends.toast.unfriended", { name: displayName(f) })).then(
            (ok) => ok && setUnfriending(null),
          );
        }}
      />
    </>
  );
}

/** The coloured dot on a photo's corner; nothing when offline. */
function StatusDot({ presence, ring, size = 14 }: { presence: Presence; ring: string; size?: number }) {
  const theme = useAppTheme();
  if (presence === "offline") return null;
  const color = presenceColor(theme, presence);
  return (
    <View
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: presence === "idle" ? ring : color,
        borderWidth: Math.max(2, size * 0.16),
        borderColor: ring,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {presence === "idle" ? <Ionicons name="moon" size={size * 0.75} color={color} /> : null}
      {presence === "dnd" ? (
        <View style={{ width: size * 0.45, height: Math.max(2, size * 0.14), borderRadius: 1, backgroundColor: ring }} />
      ) : null}
    </View>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {aside ? <Text style={styles.sectionAside}>{aside}</Text> : null}
      </View>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

function PersonRow({
  person,
  presence,
  hint,
  right,
  onPress,
}: {
  person: DirectoryProfile;
  presence?: Presence;
  hint?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const name = displayName(person);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityHint={hint}
    >
      <View>
        <ProfileAvatar size={44} initial={(name[0] ?? "?").toUpperCase()} avatarRef={person.avatar_url} />
        {presence ? <StatusDot presence={presence} ring={theme.colors.surface} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {hint ? (
          <Text
            style={[styles.rowHint, presence && presence !== "offline" && { color: presenceColor(theme, presence), fontWeight: "500" }]}
            numberOfLines={1}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

function SmallButton({
  label,
  icon,
  tone = "solid",
  busy,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "solid" | "soft";
  busy?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const ink = tone === "solid" ? theme.colors.onBrand : theme.colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.small, tone === "soft" && styles.smallSoft, (pressed || busy) && { opacity: 0.75 }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : icon ? (
        <Ionicons name={icon} size={15} color={ink} />
      ) : null}
      <Text style={[styles.smallText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({
  icon,
  label,
  busy,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  busy?: boolean;
  /** Unread messages, shown as a count on the corner. */
  badge?: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.brand} />
      ) : (
        <Ionicons name={icon} size={19} color={theme.colors.onPrimary} />
      )}
      {badge ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  me: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginBottom: 12,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  meLabel: { fontSize: 12.5, color: theme.colors.textMuted },
  meStatus: { fontSize: 15, fontWeight: "600", marginTop: 1 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text, paddingVertical: 10 },
  loading: { paddingVertical: 32 },
  muted: { fontSize: 13.5, color: theme.colors.textMuted, padding: 14 },
  section: { marginTop: 20 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2, color: theme.colors.text },
  sectionAside: { fontSize: 12.5, fontWeight: "600", color: theme.colors.success },
  list: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  rowHint: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  small: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
  },
  smallSoft: { backgroundColor: theme.colors.primary },
  smallText: { fontSize: 13, fontWeight: "600" },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  iconBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  iconBadgeText: { fontSize: 10.5, fontWeight: "700", color: theme.colors.onBrand },
  statusList: { gap: 8 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  statusRowActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.primaryMuted },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    backgroundColor: theme.colors.surface,
  },
  card: { alignItems: "center", gap: 12, paddingTop: 4 },
  presencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1.5,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  presencePillText: { fontSize: 13.5, fontWeight: "600", color: theme.colors.text },
  cardNote: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", maxWidth: 300 },
  cardActions: { gap: 10 },
  unfriendBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  unfriendText: { fontSize: 14.5, fontWeight: "600", color: theme.colors.danger },
  unfriendHero: { flexDirection: "row", alignItems: "center", gap: 0, paddingVertical: 4 },
  breakIcon: {
    zIndex: 1,
    width: 34,
    height: 34,
    marginHorizontal: -10,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
}));
