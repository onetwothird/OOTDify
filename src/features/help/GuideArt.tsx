// C:\OOTDify\src\features\help\GuideArt.tsx
// Small drawn pictures of real Penggi screens for the "How to use Penggi"
// guide. They're built from theme colours and icons (not screenshots), so they
// follow light/dark mode, never show anyone's real photos, and stay true to
// the layout: the tab bar, the capture card, the outfit slots, the chat.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Text, View } from "react-native";

import { useT } from "../../shared/i18n/useT";
import { mixHex } from "../../shared/lib/mixHex";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";

export type GuideArtKind = "tabs" | "capture" | "outfit" | "calendar" | "chat" | "community" | "capsule" | "tryon";

type IconName = keyof typeof Ionicons.glyphMap;

export function GuideArt({ kind }: { kind: GuideArtKind }) {
  const styles = useStyles();
  return (
    <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === "tabs" ? <TabsArt /> : null}
      {kind === "capture" ? <CaptureArt /> : null}
      {kind === "outfit" ? <OutfitArt /> : null}
      {kind === "calendar" ? <CalendarArt /> : null}
      {kind === "chat" ? <ChatArt /> : null}
      {kind === "community" ? <CommunityArt /> : null}
      {kind === "capsule" ? <CapsuleArt /> : null}
      {kind === "tryon" ? <TryOnArt /> : null}
    </View>
  );
}

/** A tap target: a ring with a finger, drawn over the thing to press. */
function Tap() {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.tap}>
      <Ionicons name="hand-left" size={16} color={theme.colors.accent} />
    </View>
  );
}

function TabsArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const tabs: { icon: IconName; label: string }[] = [
    { icon: "home", label: t("tab.home") },
    { icon: "shirt-outline", label: t("tab.wardrobe") },
    { icon: "compass-outline", label: t("tab.discover") },
    { icon: "people-outline", label: t("tab.community") },
    { icon: "person-circle-outline", label: t("tab.profile") },
  ];
  return (
    <View style={styles.bottomPinned}>
      <View style={styles.tabBar}>
        {tabs.map((tab, i) => (
          <View key={tab.label} style={styles.tabItem}>
            <Ionicons name={tab.icon} size={18} color={i === 0 ? theme.colors.brand : theme.colors.textMuted} />
            <Text style={[styles.tabLabel, i === 0 && { color: theme.colors.brand }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </View>
        ))}
        <View style={styles.tabItem}>
          <View style={styles.plus}>
            <Ionicons name="add" size={18} color={theme.colors.onBrand} />
          </View>
          <Text style={styles.tabLabel}>{t("tab.create")}</Text>
          <Tap />
        </View>
      </View>
    </View>
  );
}

function CaptureArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  return (
    <View style={styles.row}>
      {/* Before: the photo as taken. */}
      <View style={styles.photoBox}>
        <View style={styles.photoBg} />
        <Ionicons name="shirt" size={46} color={theme.colors.brand} />
        <Text style={styles.caption}>{t("help.art.photo")}</Text>
      </View>
      <Ionicons name="arrow-forward" size={20} color={theme.colors.textMuted} />
      {/* After: the cut-out on a checkerboard, ready to save. */}
      <View style={styles.photoBox}>
        <View style={styles.checker}>
          {Array.from({ length: 16 }).map((_, i) => (
            <View
              key={i}
              style={[styles.checkCell, (Math.floor(i / 4) + i) % 2 === 0 && { backgroundColor: theme.colors.border }]}
            />
          ))}
        </View>
        <Ionicons name="shirt" size={46} color={theme.colors.brand} />
        <Text style={styles.caption}>{t("help.art.cutout")}</Text>
      </View>
    </View>
  );
}

function OutfitArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const slots: { icon: IconName; label: string; filled: boolean }[] = [
    { icon: "shirt", label: t("outfits.builder.slot.top"), filled: true },
    { icon: "reorder-four", label: t("outfits.builder.slot.bottom"), filled: true },
    { icon: "footsteps", label: t("outfits.builder.slot.shoes"), filled: false },
  ];
  return (
    <View style={styles.row}>
      {slots.map((slot) => (
        <View key={slot.label} style={[styles.slot, !slot.filled && styles.slotEmpty]}>
          <Ionicons
            name={slot.filled ? slot.icon : "add"}
            size={28}
            color={slot.filled ? theme.colors.brand : theme.colors.textMuted}
          />
          <Text style={styles.caption}>{slot.label}</Text>
          {!slot.filled ? <Tap /> : null}
        </View>
      ))}
    </View>
  );
}

function CalendarArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <View style={styles.week}>
      {days.map((d, i) => (
        <View key={i} style={[styles.day, i === 2 && styles.dayToday]}>
          <Text style={[styles.dayLetter, i === 2 && { color: theme.colors.onBrand }]}>{d}</Text>
          {i === 1 || i === 2 || i === 4 ? (
            <Ionicons name="shirt" size={14} color={i === 2 ? theme.colors.onBrand : theme.colors.accent} />
          ) : (
            <View style={styles.dayDot} />
          )}
        </View>
      ))}
    </View>
  );
}

function ChatArt() {
  const styles = useStyles();
  const { t } = useT();
  return (
    <View style={styles.chat}>
      <View style={styles.chatRow}>
        <Image source={require("../../../assets/images/penggi-chat-greeting.png")} style={styles.chatPenggi} contentFit="contain" />
        <View style={styles.bubblePenggi}>
          <Text style={styles.bubbleText}>{t("help.art.chat_penggi")}</Text>
        </View>
      </View>
      <View style={styles.bubbleMe}>
        <Text style={styles.bubbleMeText}>{t("help.art.chat_me")}</Text>
      </View>
      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{t("help.art.chip1")}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{t("help.art.chip2")}</Text>
        </View>
      </View>
    </View>
  );
}

function CommunityArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.row}>
      {[0, 1].map((i) => (
        <View key={i} style={styles.post}>
          <View style={styles.postHead}>
            <View style={styles.postAvatar} />
            <View style={styles.postName} />
          </View>
          <View style={styles.postImage}>
            <Ionicons name={i === 0 ? "shirt" : "glasses"} size={30} color={theme.colors.brand} />
          </View>
          <View style={styles.postActions}>
            <Ionicons name={i === 0 ? "heart" : "heart-outline"} size={15} color={theme.colors.accent} />
            <Ionicons name="chatbubble-outline" size={14} color={theme.colors.textMuted} />
            <Ionicons name="bookmark-outline" size={14} color={theme.colors.textMuted} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CapsuleArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  // A tab's header band, with the pill in its top corner.
  return (
    <View style={styles.skyBand}>
      <View style={styles.capsuleRow}>
        <View style={[styles.capsule, styles.capsuleOnSky]}>
          <View>
            <Ionicons name="notifications" size={18} color={theme.colors.onFeature} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>3</Text>
            </View>
          </View>
          <View style={[styles.capsuleDivider, styles.capsuleDividerOnSky]} />
          <Ionicons name="settings-outline" size={18} color={theme.colors.onFeature} />
        </View>
      </View>
    </View>
  );
}

function TryOnArt() {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  return (
    <View style={styles.row}>
      <View style={styles.slot}>
        <Ionicons name="layers" size={26} color={theme.colors.brand} />
        <Text style={styles.caption}>{t("help.art.outfit")}</Text>
      </View>
      <Ionicons name="add" size={18} color={theme.colors.textMuted} />
      <View style={styles.slot}>
        <Ionicons name="happy-outline" size={26} color={theme.colors.brand} />
        <Text style={styles.caption}>{t("help.art.wearer")}</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={theme.colors.textMuted} />
      <View style={[styles.slot, styles.slotAccent]}>
        <Ionicons name="sparkles" size={26} color={theme.colors.accent} />
        <Text style={styles.caption}>{t("help.art.picture")}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  frame: {
    height: 150,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  bottomPinned: { position: "absolute", left: 0, right: 0, bottom: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  tap: {
    position: "absolute",
    right: -6,
    bottom: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tabBarFaded: { height: 34, paddingTop: 0, paddingBottom: 0 },
  tabItem: { flex: 1, alignItems: "center", gap: 2 },
  tabLabel: { fontSize: 8.5, fontWeight: "500", color: theme.colors.textMuted },
  plus: {
    width: 30,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  photoBox: {
    width: 104,
    height: 116,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoBg: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 46,
    backgroundColor: theme.colors.border,
  },
  checker: { position: "absolute", inset: 0, flexDirection: "row", flexWrap: "wrap" },
  checkCell: { width: "25%", height: "25%" },
  caption: { marginTop: 6, fontSize: 10.5, fontWeight: "600", color: theme.colors.textMuted },
  slot: {
    width: 84,
    height: 100,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  slotEmpty: { borderStyle: "dashed", borderColor: theme.colors.textMuted },
  slotAccent: { borderColor: theme.colors.accent },
  week: { flexDirection: "row", gap: 6 },
  day: {
    width: 36,
    height: 64,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "space-evenly",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dayToday: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  dayLetter: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.border },
  chat: { alignSelf: "stretch", gap: 6 },
  chatRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  chatPenggi: { width: 34, height: 34 },
  bubblePenggi: {
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bubbleText: { fontSize: 11.5, color: theme.colors.text },
  bubbleMe: {
    alignSelf: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderBottomRightRadius: 4,
    backgroundColor: theme.colors.brand,
  },
  bubbleMeText: { fontSize: 11.5, color: theme.colors.onBrand },
  chips: { flexDirection: "row", gap: 6, marginLeft: 40 },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.brand,
  },
  chipText: { fontSize: 10.5, fontWeight: "600", color: theme.colors.brand },
  post: {
    width: 118,
    padding: 8,
    gap: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  postHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  postAvatar: { width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.border },
  postName: { width: 46, height: 6, borderRadius: 3, backgroundColor: theme.colors.border },
  postImage: {
    height: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  postActions: { flexDirection: "row", gap: 10 },
  skyBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "62%",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: theme.colors.feature,
  },
  capsuleRow: { alignItems: "flex-end", paddingRight: 14, paddingTop: 12 },
  capsuleOnSky: {
    backgroundColor: mixHex(theme.colors.feature, theme.colors.onFeature, 0.14),
    borderColor: mixHex(theme.colors.feature, theme.colors.onFeature, 0.28),
  },
  capsuleDividerOnSky: { backgroundColor: mixHex(theme.colors.feature, theme.colors.onFeature, 0.28) },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  capsuleDivider: { width: 1, height: 18, backgroundColor: theme.colors.border },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.danger,
  },
  badgeText: { fontSize: 8.5, fontWeight: "700", color: theme.colors.surface },
}));
