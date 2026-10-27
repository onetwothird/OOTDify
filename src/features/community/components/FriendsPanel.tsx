// C:\OOTDify\src\features\community\components\FriendsPanel.tsx
// The Friends tab of Community: find people by name, answer friend requests,
// and see your friends with a green dot when they're online. A friend's dot
// only shows when they share their online status (Settings).
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { EmptyState, ErrorState } from "../../../shared/components/StateViews";
import { useT } from "../../../shared/i18n/useT";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { communityErrorMessage, startDirectConversation } from "../service";
import { friendStateWith, type FriendState } from "../social";
import {
  acceptFriendRequest,
  displayName,
  fetchFriends,
  removeFriendship,
  searchPeople,
  sendFriendRequest,
  type FriendsOverview,
  type Person,
} from "../socialService";
import type { DirectoryProfile } from "../types";

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

  const [data, setData] = useState<FriendsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryProfile[] | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchFriends());
      setError(null);
    } catch (e) {
      setError(communityErrorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Online dots go stale while the tab sits open; refresh them every minute.
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
    } catch (e) {
      toast.error(t("friends.toast.error"), communityErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const message = async (person: DirectoryProfile) => {
    setBusyId(person.user_id);
    try {
      const id = await startDirectConversation(person.user_id);
      router.push(`/community/chat/${id}`);
    } catch (e) {
      toast.error(t("community.toast.chat_error.title"), communityErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmUnfriend = (person: Person) => {
    const name = displayName(person);
    Alert.alert(t("friends.unfriend.title", { name }), t("friends.unfriend.message"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("friends.unfriend.confirm"),
        style: "destructive",
        onPress: () => void run(person.user_id, () => removeFriendship(person.user_id)),
      },
    ]);
  };

  const stateOf = (id: string): FriendState => (data ? friendStateWith(data.rows, data.me, id) : "none");

  /** The one action a search result offers, by where you stand with them. */
  const searchAction = (person: DirectoryProfile) => {
    const id = person.user_id;
    const state = stateOf(id);
    if (state === "friends") return <Tag icon="checkmark" label={t("friends.state.friends")} />;
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

  const online = data?.friends.filter((f) => f.online).length ?? 0;

  return (
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
            <ActivityIndicator color={theme.colors.brand} style={styles.loading} />
          ) : results.length === 0 ? (
            <Text style={styles.muted}>{t("friends.search.none")}</Text>
          ) : (
            results.map((p) => <PersonRow key={p.user_id} person={p} right={searchAction(p)} />)
          )}
        </Section>
      ) : data === null && !error ? (
        <ActivityIndicator color={theme.colors.brand} style={styles.loading} />
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
                  online={p.online}
                  hint={p.online ? t("friends.online") : t("friends.offline")}
                  onLongPress={() => confirmUnfriend(p)}
                  right={
                    <View style={styles.actions}>
                      <IconButton
                        icon="chatbubble-ellipses-outline"
                        label={t("friends.message")}
                        busy={busyId === p.user_id}
                        onPress={() => void message(p)}
                      />
                      <IconButton
                        icon="ellipsis-horizontal"
                        label={t("friends.unfriend.confirm")}
                        onPress={() => confirmUnfriend(p)}
                      />
                    </View>
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
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function PersonRow({
  person,
  online,
  hint,
  right,
  onLongPress,
}: {
  person: DirectoryProfile;
  online?: boolean;
  hint?: string;
  right?: ReactNode;
  onLongPress?: () => void;
}) {
  const styles = useStyles();
  const name = displayName(person);
  return (
    <Pressable onLongPress={onLongPress} style={styles.row} accessibilityHint={hint}>
      <View>
        <ProfileAvatar size={44} initial={(name[0] ?? "?").toUpperCase()} avatarRef={person.avatar_url} />
        {online ? <View style={styles.dot} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {hint ? (
          <Text style={[styles.rowHint, online && styles.rowHintOnline]} numberOfLines={1}>
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
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  busy?: boolean;
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
    </Pressable>
  );
}

function Tag({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.tag}>
      <Ionicons name={icon} size={14} color={theme.colors.success} />
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 4 },
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
  card: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  dot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.success,
    borderWidth: 2.5,
    borderColor: theme.colors.surface,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  rowHint: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 1 },
  rowHintOnline: { color: theme.colors.success, fontWeight: "500" },
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
  tagText: { fontSize: 13, fontWeight: "600", color: theme.colors.success },
}));
