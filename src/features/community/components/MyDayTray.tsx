// C:\OOTDify\src\features\community\components\MyDayTray.tsx
// The row of My Day circles above the feed: yours first (tap to watch, "+" to
// add), then friends with something new (denim ring), then ones you've seen
// (plain ring). Reloads whenever the Community tab comes back into focus, so
// circles you just watched turn grey.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useAvatarStore } from "../../profile/avatarStore";
import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { groupMyDay, noteIsLive, type FriendNote, type MyDayGroup } from "../social";
import { displayName, fetchMyDay, fetchNotes, type MyDayFeed } from "../socialService";
import { MyDayComposer } from "./MyDayComposer";
import { NoteSheet } from "./NoteSheet";

const MIN_CIRCLE = 54;
const MAX_CIRCLE = 72;
const GUTTER = 20;
const GAP = 14;
/** Height reserved above every circle for its note: room for two short lines. */
const NOTE_SLOT = 40;

export function MyDayTray() {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const myAvatar = useAvatarStore((s) => s.ref);
  const [feed, setFeed] = useState<MyDayFeed | null>(null);
  // When the feed was read, so expiry is judged without reading the clock in render.
  const [loadedAt, setLoadedAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [composing, setComposing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [notes, setNotes] = useState<Map<string, FriendNote>>(new Map());

  // The circles scale with the screen so the row fits any phone.
  const { width } = useWindowDimensions();
  const CIRCLE = Math.min(MAX_CIRCLE, Math.max(MIN_CIRCLE, Math.round(width * 0.155)));
  const itemWidth = CIRCLE + 8;
  // A note may spread into the gap on both sides, like a thought bubble, so
  // short phrases like "Add a note" fit without cutting off.
  const noteWidth = itemWidth + GAP - 4;
  const noteFont = CIRCLE < 62 ? 10 : 11;

  const load = useCallback(async () => {
    try {
      setFeed(await fetchMyDay());
      setLoadedAt(Date.now());
      setFailed(false);
    } catch {
      setFailed(true);
    }
    // Notes are an extra: if their table isn't there yet the circles still show.
    void fetchNotes()
      .then(setNotes)
      .catch(() => setNotes(new Map()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // My Day is an extra above the feed: when its tables aren't there yet the
  // feed still shows, without a tray.
  if (failed) return null;

  const groups: MyDayGroup[] = feed ? groupMyDay(feed.posts, feed.viewed, feed.me, loadedAt) : [];
  const mine = groups.find((g) => g.userId === feed?.me);
  const friends = groups.filter((g) => g.userId !== feed?.me);
  const open = (userId: string) => router.push({ pathname: "/community/myday/[userId]", params: { userId } });
  const noteOf = (userId: string | undefined) => {
    const n = userId ? notes.get(userId) : undefined;
    return n && noteIsLive(n, loadedAt) ? n.body : null;
  };
  const myNote = noteOf(feed?.me);
  // What is left of the row after yours, so the one-line hint fits any width.
  const hintWidth = Math.max(120, width - GUTTER * 2 - itemWidth - GAP);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* Yours: watch it when you have posts, otherwise the whole tile adds one. */}
        <View style={[styles.item, { width: itemWidth }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={myNote ? t("note.title") : t("note.add")}
            hitSlop={{ top: 6, bottom: 2, left: 4, right: 4 }}
            onPress={() => setNoting(true)}
            style={({ pressed }) => [
              styles.note,
              !myNote && styles.noteEmpty,
              { width: noteWidth },
              pressed && styles.notePressed,
            ]}
          >
            <Text
              style={[styles.noteText, { fontSize: noteFont }, !myNote && styles.noteTextEmpty]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {myNote ?? t("note.add")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mine ? t("myday.yours.a11y") : t("myday.add")}
            onPress={() => (mine && feed ? open(feed.me) : setComposing(true))}
            style={[styles.ring, mine ? styles.ringSeen : styles.ringEmpty, { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2 }]}
          >
            <ProfileAvatar size={CIRCLE - 8} initial="" avatarRef={myAvatar} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("myday.add")}
            hitSlop={6}
            onPress={() => setComposing(true)}
            style={[styles.plus, { top: NOTE_SLOT + CIRCLE - 22 }]}
          >
            <Ionicons name="add" size={15} color={theme.colors.onBrand} />
          </Pressable>
          <Text style={[styles.name, { maxWidth: itemWidth }]} numberOfLines={1}>
            {t("myday.yours")}
          </Text>
        </View>

        {friends.map((g) => {
          const profile = feed?.profiles.get(g.userId);
          const name = displayName(profile).split(/\s+/)[0];
          const note = noteOf(g.userId);
          return (
            <Pressable
              key={g.userId}
              accessibilityRole="button"
              accessibilityLabel={t(g.seen ? "myday.friend.seen_a11y" : "myday.friend.new_a11y", { name })}
              onPress={() => open(g.userId)}
              style={[styles.item, { width: itemWidth }]}
            >
              <View style={[styles.note, !note && styles.noteHidden, { maxWidth: noteWidth }]}>
                <Text style={[styles.noteText, { fontSize: noteFont }]} numberOfLines={2}>
                  {note ?? " "}
                </Text>
              </View>
              <View style={[styles.ring, g.seen ? styles.ringSeen : styles.ringNew, { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2 }]}>
                <ProfileAvatar
                  size={CIRCLE - 8}
                  initial={(name[0] ?? "?").toUpperCase()}
                  avatarRef={profile?.avatar_url ?? null}
                />
              </View>
              <Text style={[styles.name, !g.seen && styles.nameNew, { maxWidth: itemWidth }]} numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
          );
        })}

        {feed && friends.length === 0 ? (
          <View style={[styles.hint, { width: hintWidth, paddingTop: NOTE_SLOT }]}>
            <Text style={styles.hintText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {t("myday.empty")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <NoteSheet visible={noting} onClose={() => setNoting(false)} current={myNote} onChanged={() => void load()} />

      <MyDayComposer
        visible={composing}
        onClose={() => setComposing(false)}
        onPosted={() => {
          setComposing(false);
          void load();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: { marginBottom: 14 },
  // Room on the left for the first note bubble, which is wider than its circle.
  row: { gap: GAP, paddingVertical: 4, paddingLeft: GAP / 2 - 2, paddingRight: 8 },
  item: { alignItems: "center" },
  // A note sits above the circle: up to two lines, wider than the circle,
  // like Messenger's thought bubbles.
  note: {
    height: NOTE_SLOT - 4,
    marginBottom: 4,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  noteEmpty: { borderStyle: "dashed", backgroundColor: "transparent" },
  noteHidden: { opacity: 0 },
  notePressed: { opacity: 0.7 },
  noteText: { fontWeight: "500", lineHeight: 14, textAlign: "center", color: theme.colors.text },
  noteTextEmpty: { color: theme.colors.textMuted },
  ring: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
  },
  ringNew: { borderColor: theme.colors.brand },
  ringSeen: { borderColor: theme.colors.border },
  ringEmpty: { borderColor: theme.colors.border, borderStyle: "dashed" },
  plus: {
    position: "absolute",
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  name: { marginTop: 6, fontSize: 12, fontWeight: "500", color: theme.colors.textMuted },
  nameNew: { color: theme.colors.text, fontWeight: "600" },
  hint: { justifyContent: "center", paddingBottom: 18 },
  hintText: { fontSize: 12.5, lineHeight: 17, color: theme.colors.textMuted },
}));
