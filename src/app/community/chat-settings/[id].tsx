// C:\OOTDify\src\app\community\chat-settings\[id].tsx
// Settings for one conversation, opened from the chat header's info button.
// Everyone gets the chat theme, mute and shared photos. Communities add the
// members list (Creator / Admin badges, admin tools) and leave / delete; DMs
// link to the other person's profile instead. Permission rules live in
// features/community/chatSettings.ts and are enforced again by the database.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CHAT_THEMES,
  canChangeTheme,
  memberActions,
  memberRole,
  muteState,
  muteUntil,
  sortMembers,
  type MemberAction,
  type MemberRole,
  type MuteOption,
} from "../../../features/community/chatSettings";
import { EditRoomIconSheet } from "../../../features/community/components/EditRoomIconSheet";
import { RoomIcon } from "../../../features/community/components/RoomIcon";
import {
  COMMUNITY_ROOM_ID,
  communityErrorMessage,
  deleteConversation,
  fetchChatPhotos,
  fetchConversationSettings,
  leaveConversation,
  removeMember,
  setChatTheme,
  setConversationMuted,
  setRoomAdmin,
} from "../../../features/community/service";
import type { ConversationMember, ConversationSettings } from "../../../features/community/types";
import { ProfileAvatar } from "../../../features/profile/ProfileAvatar";
import { FlyingPreloader } from "../../../shared/components/FlyingPreloader";
import { ScreenHeader } from "../../../shared/components/ScreenHeader";
import { Sheet } from "../../../shared/components/Sheet";
import { SmartImage } from "../../../shared/components/SmartImage";
import { ErrorState } from "../../../shared/components/StateViews";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { supabase } from "../../../shared/lib/supabase";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";

type Member = ConversationMember & { role: MemberRole };
const MUTE_OPTIONS: MuteOption[] = ["1h", "8h", "24h", "forever"];
const PHOTO_COLUMNS = 3;
const PHOTO_GAP = 4;

export default function ChatSettingsScreen() {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : "";

  const [meId, setMeId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [photos, setPhotos] = useState<{ id: string; image_ref: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingIcon, setEditingIcon] = useState(false);
  const [memberSheet, setMemberSheet] = useState<Member | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  // When the mute state was last read, so "Muted until" is judged consistently.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!conversationId) return;
    setError(null);
    try {
      const [{ data }, next, shared] = await Promise.all([
        supabase.auth.getSession(),
        fetchConversationSettings(conversationId),
        fetchChatPhotos(conversationId),
      ]);
      setMeId(data.session?.user?.id ?? null);
      setSettings(next);
      setPhotos(shared);
      setNow(Date.now());
    } catch (e) {
      setError(communityErrorMessage(e));
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const back = () => router.back();
  const header = (
    <ScreenHeader
      title={t("community.settings.title")}
      onBack={back}
      backLabel={t("community.chat.back_a11y")}
    />
  );

  if (!settings) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.pad}>{header}</View>
        <View style={styles.fill}>
          {error ? <ErrorState message={error} onRetry={() => void load()} /> : <FlyingPreloader size={88} />}
        </View>
      </View>
    );
  }

  const adminIds = new Set(settings.adminIds);
  const members: Member[] = sortMembers(
    settings.members.map((m) => ({ ...m, role: memberRole(m.userId, settings.createdBy, adminIds) })),
  );
  const myRole: MemberRole = meId ? memberRole(meId, settings.createdBy, adminIds) : "member";
  const isAdmin = myRole !== "member";
  const themeEditable = canChangeTheme(settings.isCommunity, myRole);
  const peer = settings.isCommunity ? null : members.find((m) => m.userId !== meId) ?? null;
  const title = settings.isCommunity
    ? settings.title || t("community.chat.title.community_chat")
    : peer?.name || t("community.chat.title.default");
  const sharedRoom = conversationId === COMMUNITY_ROOM_ID;
  const mute = muteState(settings.mutedUntil, now);
  const tile = (width - 40 - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS;

  const run = async (work: () => Promise<void>, failMessage: string) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(failMessage, communityErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pickTheme = (key: string | null) =>
    void run(async () => {
      await setChatTheme(conversationId, key);
      setSettings((s) => (s ? { ...s, chatTheme: key } : s));
    }, t("community.settings.theme_error"));

  const pickMute = (option: MuteOption | null) =>
    void run(async () => {
      const until = option ? muteUntil(option, Date.now()) : null;
      await setConversationMuted(conversationId, until);
      setSettings((s) => (s ? { ...s, mutedUntil: until } : s));
      setNow(Date.now());
      toast.success(option ? t("community.settings.muted_toast") : t("community.settings.unmuted_toast"));
    }, t("community.settings.mute_error"));

  const memberAction = (member: Member, action: MemberAction) => {
    if (action === "remove" && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setMemberSheet(null);
    setConfirmRemove(false);
    void run(async () => {
      if (action === "remove") {
        await removeMember(conversationId, member.userId);
        toast.success(t("community.settings.removed_toast", { name: member.name }));
      } else {
        await setRoomAdmin(conversationId, member.userId, action === "make_admin");
      }
      await load();
    }, t("community.settings.member_error"));
  };

  const exit = () => {
    if (!confirmExit) {
      setConfirmExit(true);
      return;
    }
    void run(async () => {
      if (myRole === "creator") await deleteConversation(conversationId);
      else await leaveConversation(conversationId);
      router.replace("/(tabs)/community");
    }, myRole === "creator" ? t("community.settings.delete_error") : t("community.settings.leave_error"));
  };

  const roleLabel = (role: MemberRole) =>
    role === "creator" ? t("community.settings.role.creator") : role === "admin" ? t("community.settings.role.admin") : null;

  const muteText =
    mute.kind === "off"
      ? t("community.settings.mute_off")
      : mute.kind === "forever"
        ? t("community.settings.mute_forever_on")
        : t("community.settings.mute_until", {
            time: new Date(mute.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }),
          });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]}>
        {header}

        {/* ---------------------------------------------------------- Identity */}
        <View style={styles.identity}>
          {settings.isCommunity ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("community.room_icon.change_a11y")}
              disabled={!isAdmin}
              onPress={() => setEditingIcon(true)}
            >
              <RoomIcon size={84} title={title} iconUrl={settings.iconUrl} iconPreset={settings.iconPreset} />
              {isAdmin ? (
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={13} color={theme.colors.onBrand} />
                </View>
              ) : null}
            </Pressable>
          ) : (
            <ProfileAvatar size={84} initial={(title[0] ?? "?").toUpperCase()} avatarRef={peer?.avatar ?? null} />
          )}
          <Text style={styles.name} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta}>
            {settings.isCommunity
              ? [settings.category, t("community.settings.member_count", { count: members.length })]
                  .filter(Boolean)
                  .join(" · ")
              : t("community.chat.subtitle.dm")}
          </Text>
          {peer ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/community/profile/[userId]", params: { userId: peer.userId } })}
              style={({ pressed }) => [styles.pillBtn, pressed && styles.pressed]}
            >
              <Ionicons name="person-outline" size={16} color={theme.colors.text} />
              <Text style={styles.pillText}>{t("community.settings.view_profile")}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* -------------------------------------------------------- Appearance */}
        <Text style={styles.section}>{t("community.settings.appearance")}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t("community.settings.theme")}</Text>
          <View style={styles.swatches}>
            {[null, ...CHAT_THEMES].map((preset) => {
              const key = preset?.key ?? null;
              const active = settings.chatTheme === key || (key === null && !CHAT_THEMES.some((p) => p.key === settings.chatTheme));
              return (
                <Pressable
                  key={key ?? "default"}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled: !themeEditable || busy }}
                  accessibilityLabel={key ? t(`community.settings.theme_name.${key}` as "community.settings.theme_name.denim") : t("community.settings.theme_default")}
                  disabled={!themeEditable || busy}
                  onPress={() => pickTheme(key)}
                  style={[styles.swatchRing, active && styles.swatchRingOn]}
                >
                  <View style={[styles.swatch, { backgroundColor: preset?.bubble ?? theme.colors.primary }]}>
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={preset?.onBubble ?? theme.colors.onPrimary} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {themeEditable ? t("community.settings.theme_hint") : t("community.settings.theme_admin_only")}
          </Text>
        </View>

        {/* ----------------------------------------------------- Notifications */}
        <Text style={styles.section}>{t("community.settings.notifications")}</Text>
        <View style={styles.card}>
          <View style={styles.rowStatic}>
            <Ionicons
              name={mute.kind === "off" ? "notifications-outline" : "notifications-off-outline"}
              size={20}
              color={theme.colors.text}
            />
            <Text style={styles.rowText}>{muteText}</Text>
          </View>
          {sharedRoom ? <Text style={styles.hint}>{t("community.settings.shared_room_quiet")}</Text> : null}
          {MUTE_OPTIONS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => pickMute(option)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowText}>{t(`community.settings.mute.${option}` as "community.settings.mute.1h")}</Text>
            </Pressable>
          ))}
          {mute.kind !== "off" ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => pickMute(null)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={[styles.rowText, styles.brandText]}>{t("community.settings.unmute")}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ----------------------------------------------------------- Members */}
        {settings.isCommunity ? (
          <>
            <Text style={styles.section}>
              {t("community.settings.members")} · {members.length}
            </Text>
            <View style={styles.card}>
              {members.map((m) => {
                const self = m.userId === meId;
                const actions = memberActions(myRole, m.role, self);
                const badge = roleLabel(m.role);
                return (
                  <View key={m.userId} style={styles.member}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={self}
                      onPress={() => router.push({ pathname: "/community/profile/[userId]", params: { userId: m.userId } })}
                      style={({ pressed }) => [styles.memberMain, pressed && styles.pressed]}
                    >
                      <ProfileAvatar size={40} initial={(m.name[0] ?? "?").toUpperCase()} avatarRef={m.avatar} />
                      <View style={styles.memberTexts}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {self ? t("community.settings.you", { name: m.name }) : m.name}
                        </Text>
                        {badge ? <Text style={styles.memberRole}>{badge}</Text> : null}
                      </View>
                    </Pressable>
                    {actions.length ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("community.settings.member_options_a11y", { name: m.name })}
                        hitSlop={8}
                        onPress={() => {
                          setConfirmRemove(false);
                          setMemberSheet(m);
                        }}
                        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ------------------------------------------------------------ Photos */}
        <Text style={styles.section}>{t("community.settings.photos")}</Text>
        {photos.length ? (
          <View style={styles.photos}>
            {photos.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={t("community.chat.photo.a11y")}
                onPress={() => setPhotoOpen(p.image_ref)}
              >
                <SmartImage source={p.image_ref} style={[styles.photo, { width: tile, height: tile }]} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{t("community.settings.no_photos")}</Text>
        )}

        {/* ------------------------------------------------------ Leave/delete */}
        {settings.isCommunity && !sharedRoom ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={exit}
            style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
          >
            <Ionicons
              name={myRole === "creator" ? "trash-outline" : "exit-outline"}
              size={20}
              color={theme.colors.danger}
            />
            <Text style={styles.dangerText}>
              {myRole === "creator"
                ? confirmExit
                  ? t("community.settings.delete_confirm")
                  : t("community.settings.delete")
                : confirmExit
                  ? t("community.settings.leave_confirm")
                  : t("community.settings.leave")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {settings.isCommunity && isAdmin ? (
        <EditRoomIconSheet
          visible={editingIcon}
          onClose={() => setEditingIcon(false)}
          roomId={conversationId}
          title={title}
          current={{ iconUrl: settings.iconUrl, iconPreset: settings.iconPreset }}
          onSaved={(next) => setSettings((s) => (s ? { ...s, ...next } : s))}
        />
      ) : null}

      <Sheet
        visible={memberSheet !== null}
        onClose={() => {
          setMemberSheet(null);
          setConfirmRemove(false);
        }}
        title={memberSheet?.name ?? ""}
        icon="person-outline"
      >
        {memberSheet
          ? memberActions(myRole, memberSheet.role, memberSheet.userId === meId).map((action) => (
              <Pressable
                key={action}
                accessibilityRole="button"
                onPress={() => memberAction(memberSheet, action)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={[styles.rowText, action === "remove" && styles.dangerText]}>
                  {action === "make_admin"
                    ? t("community.settings.make_admin")
                    : action === "remove_admin"
                      ? t("community.settings.remove_admin")
                      : confirmRemove
                        ? t("community.settings.remove_member_confirm")
                        : t("community.settings.remove_member")}
                </Text>
              </Pressable>
            ))
          : null}
      </Sheet>

      <Sheet visible={photoOpen !== null} onClose={() => setPhotoOpen(null)} title={t("community.settings.photo_title")} icon="image-outline">
        {photoOpen ? (
          <SmartImage
            source={photoOpen}
            style={styles.photoLarge}
            contentFit="contain"
            accessibilityLabel={t("community.chat.photo.a11y")}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  pad: { paddingHorizontal: 20 },
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
  identity: { alignItems: "center", gap: 6, marginTop: theme.spacing.lg, marginBottom: theme.spacing.md },
  editBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  name: { ...theme.typography.heading, color: theme.colors.text, textAlign: "center", marginTop: 6 },
  meta: { ...theme.typography.caption, color: theme.colors.textMuted },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  pillText: { ...theme.typography.caption, color: theme.colors.text, fontWeight: "600" },
  section: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    fontWeight: "700",
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  label: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  hint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.sm },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: theme.spacing.sm },
  swatchRing: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: "transparent" },
  swatchRingOn: { borderColor: theme.colors.text },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rowStatic: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6 },
  row: { paddingVertical: 12, paddingHorizontal: 4, borderRadius: theme.borderRadius.md },
  rowPressed: { backgroundColor: theme.colors.surfaceAlt },
  rowText: { ...theme.typography.body, color: theme.colors.text, flexShrink: 1 },
  brandText: { color: theme.colors.brand, fontWeight: "600" },
  member: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  memberMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  memberTexts: { flex: 1, minWidth: 0 },
  memberName: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  memberRole: { ...theme.typography.caption, color: theme.colors.brand, fontWeight: "600" },
  iconBtn: { padding: 8 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: PHOTO_GAP },
  photo: { borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  photoLarge: { width: "100%", aspectRatio: 3 / 4, borderRadius: theme.borderRadius.md },
  empty: { ...theme.typography.caption, color: theme.colors.textMuted },
  danger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: theme.spacing.xl,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  dangerText: { ...theme.typography.body, color: theme.colors.danger, fontWeight: "600" },
}));
