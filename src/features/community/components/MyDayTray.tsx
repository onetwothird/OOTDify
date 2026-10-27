// C:\OOTDify\src\features\community\components\MyDayTray.tsx
// The row of My Day circles above the feed: yours first (tap to watch, "+" to
// add), then friends with something new (denim ring), then ones you've seen
// (plain ring). Reloads whenever the Community tab comes back into focus, so
// circles you just watched turn grey.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useAvatarStore } from "../../profile/avatarStore";
import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { groupMyDay, type MyDayGroup } from "../social";
import { displayName, fetchMyDay, type MyDayFeed } from "../socialService";
import { MyDayComposer } from "./MyDayComposer";

const CIRCLE = 62;

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

  const load = useCallback(async () => {
    try {
      setFeed(await fetchMyDay());
      setLoadedAt(Date.now());
      setFailed(false);
    } catch {
      setFailed(true);
    }
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

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* Yours: watch it when you have posts, otherwise the whole tile adds one. */}
        <View style={styles.item}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mine ? t("myday.yours.a11y") : t("myday.add")}
            onPress={() => (mine && feed ? open(feed.me) : setComposing(true))}
            style={[styles.ring, mine ? styles.ringSeen : styles.ringEmpty]}
          >
            <ProfileAvatar size={CIRCLE - 8} initial="" avatarRef={myAvatar} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("myday.add")}
            hitSlop={6}
            onPress={() => setComposing(true)}
            style={styles.plus}
          >
            <Ionicons name="add" size={15} color={theme.colors.onBrand} />
          </Pressable>
          <Text style={styles.name} numberOfLines={1}>
            {t("myday.yours")}
          </Text>
        </View>

        {friends.map((g) => {
          const profile = feed?.profiles.get(g.userId);
          const name = displayName(profile).split(/\s+/)[0];
          return (
            <Pressable
              key={g.userId}
              accessibilityRole="button"
              accessibilityLabel={t(g.seen ? "myday.friend.seen_a11y" : "myday.friend.new_a11y", { name })}
              onPress={() => open(g.userId)}
              style={styles.item}
            >
              <View style={[styles.ring, g.seen ? styles.ringSeen : styles.ringNew]}>
                <ProfileAvatar
                  size={CIRCLE - 8}
                  initial={(name[0] ?? "?").toUpperCase()}
                  avatarRef={profile?.avatar_url ?? null}
                />
              </View>
              <Text style={[styles.name, !g.seen && styles.nameNew]} numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
          );
        })}

        {feed && friends.length === 0 ? (
          <View style={styles.hint}>
            <Text style={styles.hintText}>{t("myday.empty")}</Text>
          </View>
        ) : null}
      </ScrollView>

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
  row: { gap: 14, paddingVertical: 4, paddingRight: 8 },
  item: { width: CIRCLE + 4, alignItems: "center" },
  ring: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
  },
  ringNew: { borderColor: theme.colors.brand },
  ringSeen: { borderColor: theme.colors.border },
  ringEmpty: { borderColor: theme.colors.border, borderStyle: "dashed" },
  plus: {
    position: "absolute",
    top: CIRCLE - 22,
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
  name: { marginTop: 6, fontSize: 12, fontWeight: "500", color: theme.colors.textMuted, maxWidth: CIRCLE + 4 },
  nameNew: { color: theme.colors.text, fontWeight: "600" },
  hint: { justifyContent: "center", maxWidth: 180, paddingBottom: 18 },
  hintText: { fontSize: 12.5, lineHeight: 17, color: theme.colors.textMuted },
}));
