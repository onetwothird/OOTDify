// C:\OOTDify\src\app\notifications.tsx
// Notifications inbox: everything that happened to you, newest first, split
// into Today and Earlier. Unread messages from one chat are a single entry.
// Tapping an entry marks it read and opens what it is about; "Mark all as
// read" and "Clear" act on your own rows only.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { timeAgo } from "../features/community/format";
import { communityErrorMessage } from "../features/community/service";
import { groupInbox, routeFor, type InboxItem } from "../features/notifications/inbox";
import { openInboxRoute } from "../features/notifications/openNotification";
import {
  clearInbox,
  fetchInbox,
  markAllRead,
  markRead,
  type InboxEntryRow,
} from "../features/notifications/service";
import { useNotificationsStore } from "../features/notifications/store";
import { inboxText, NOTIFICATION_ICON } from "../features/notifications/text";
import { ProfileAvatar } from "../features/profile/ProfileAvatar";
import { ConfirmSheet } from "../shared/components/ConfirmSheet";
import { EmptyState, ErrorState } from "../shared/components/StateViews";
import { useT } from "../shared/i18n/useT";
import { supabase } from "../shared/lib/supabase";
import { toast } from "../shared/lib/toast";
import { makeStyles } from "../shared/theme/makeStyles";
import { useAppTheme } from "../shared/theme/ThemeProvider";

type Entry = InboxItem & { row: InboxEntryRow };

export default function NotificationsScreen() {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const setUnread = useNotificationsStore((s) => s.setUnread);

  const [rows, setRows] = useState<InboxEntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  // The clock at load time, so "Today" is decided without reading it in render.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchInbox();
      setRows(data);
      setLoadedAt(Date.now());
      setError(null);
      setUnread(data.filter((r) => !r.read_at).length);
    } catch (e) {
      setError(communityErrorMessage(e));
    }
  }, [setUnread]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const items = groupInbox(rows ?? []) as Entry[];
    const today = new Date(loadedAt);
    today.setHours(0, 0, 0, 0);
    const start = today.getTime();
    const fresh = items.filter((i) => Date.parse(i.row.created_at) >= start);
    const older = items.filter((i) => Date.parse(i.row.created_at) < start);
    return [
      ...(fresh.length ? [{ title: t("notifications.today"), data: fresh }] : []),
      ...(older.length ? [{ title: t("notifications.earlier"), data: older }] : []),
    ];
  }, [rows, loadedAt, t]);

  const unread = (rows ?? []).filter((r) => !r.read_at).length;

  const open = async (item: Entry) => {
    const ids = item.ids;
    if (!item.row.read_at) {
      setRows((prev) => prev?.map((r) => (ids.includes(r.id) ? { ...r, read_at: new Date().toISOString() } : r)) ?? prev);
      setUnread(Math.max(0, unread - ids.length));
      void markRead(ids).catch(() => {});
    }
    const { data } = await supabase.auth.getSession();
    openInboxRoute(router, routeFor(item.row), data.session?.user?.id ?? null);
  };

  const readAll = async () => {
    try {
      await markAllRead();
      setRows((prev) => prev?.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })) ?? prev);
      setUnread(0);
    } catch (e) {
      toast.error(t("notifications.toast.error"), communityErrorMessage(e));
    }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await clearInbox();
      setRows([]);
      setUnread(0);
      setConfirmClear(false);
    } catch (e) {
      toast.error(t("notifications.toast.error"), communityErrorMessage(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ai_picker.back_a11y")}
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {t("notifications.title")}
          </Text>
          <Text style={styles.subtitle}>
            {unread ? t("notifications.unread_count", { count: unread }) : t("notifications.all_caught_up")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("notifications.settings")}
          hitSlop={8}
          onPress={() => router.push("/settings/notifications")}
          style={styles.backBtn}
        >
          <Ionicons name="options-outline" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      {rows && rows.length > 0 ? (
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            disabled={!unread}
            onPress={() => void readAll()}
            style={({ pressed }) => [styles.toolBtn, !unread && styles.dim, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="checkmark-done" size={16} color={theme.colors.onPrimary} />
            <Text style={styles.toolText}>{t("notifications.mark_all")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmClear(true)}
            style={({ pressed }) => [styles.toolBtnGhost, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
            <Text style={styles.toolTextGhost}>{t("notifications.clear")}</Text>
          </Pressable>
        </View>
      ) : null}

      {rows === null && !error ? (
        <ActivityIndicator color={theme.colors.brand} style={styles.loading} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.row.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
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
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => <Row item={item} onPress={() => void open(item)} />}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title={t("notifications.empty.title")}
              message={t("notifications.empty.message")}
            />
          }
        />
      )}

      <ConfirmSheet
        visible={confirmClear}
        onClose={() => setConfirmClear(false)}
        icon="trash-outline"
        title={t("notifications.clear.title")}
        message={t("notifications.clear.message")}
        confirmLabel={t("notifications.clear")}
        cancelLabel={t("notifications.clear.keep")}
        busy={clearing}
        onConfirm={() => void clearAll()}
      />
    </View>
  );
}

function Row({ item, onPress }: { item: Entry; onPress: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const { row } = item;
  const text = inboxText(t, row, row.actor, row.roomTitle, item.count);
  const name = row.actor?.display_name || row.actor?.first_name || "?";
  const unread = !row.read_at;
  const hearty = row.type === "post_like" || row.type === "my_day_like";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text.title}. ${text.body}`}
      accessibilityState={{ selected: unread }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && { opacity: 0.85 }]}
    >
      <View>
        <ProfileAvatar size={48} initial={name[0].toUpperCase()} avatarRef={row.actor?.avatar_url ?? null} />
        <View style={[styles.kind, hearty && styles.kindHeart]}>
          <Ionicons name={NOTIFICATION_ICON[row.type]} size={11} color={hearty ? theme.colors.surface : theme.colors.onBrand} />
        </View>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
          {text.title}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {text.body}
        </Text>
        <Text style={[styles.rowTime, unread && styles.rowTimeUnread]}>{timeAgo(row.created_at)}</Text>
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3, color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 1 },
  toolbar: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4 },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.primary,
  },
  toolText: { fontSize: 13, fontWeight: "600", color: theme.colors.onPrimary },
  toolBtnGhost: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, paddingHorizontal: 10 },
  toolTextGhost: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  dim: { opacity: 0.5 },
  loading: { marginTop: 48 },
  list: { paddingHorizontal: 12 },
  section: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
  },
  rowUnread: { backgroundColor: theme.colors.primaryMuted },
  kind: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  kindHeart: { backgroundColor: theme.colors.danger },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, fontWeight: "600", color: theme.colors.text },
  rowTitleUnread: { fontWeight: "700" },
  rowBody: { fontSize: 13.5, lineHeight: 18, color: theme.colors.textMuted, marginTop: 1 },
  rowTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  rowTimeUnread: { color: theme.colors.brand, fontWeight: "600" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand },
}));
