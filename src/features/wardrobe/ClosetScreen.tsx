import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import type { ClothingItem } from "../../features/clothing/types";
import { WARDROBE_CATEGORIES } from "../../features/clothing/types";
import {
  addItemFavorite,
  fetchItemFavoriteIds,
  removeItemFavorite,
} from "../../features/clothing/service";
import { filterCloset } from "../../features/wardrobe/filter";
import { useWardrobeStore } from "../../features/wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { SkeletonGrid } from "../../shared/components/LoadingState";
import { QuickActions } from "../notifications/QuickActions";
import { PenggiHeader, PenggiStatusShade } from "../../shared/components/PenggiHeader";
import { EmptyState } from "../../shared/components/StateViews";
import { SmartImage } from "../../shared/components/SmartImage";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useResponsiveColumns } from "../../shared/hooks/useResponsiveColumns";
import { useT } from "../../shared/i18n/useT";
import { useHideOnScroll, useTabBarSpace } from "../../shared/navigation/useTabChrome";

const GRID_PAGE = 24;

/** The Closet half of the Wardrobe tab; `switcher` (Closet | Outfits) sits under its header. */
export function ClosetScreen({ switcher }: { switcher: ReactNode }) {
  // The tab bar slides away while scrolling down; content clears it at the end.
  const hideOnScroll = useHideOnScroll();
  const tabBarSpace = useTabBarSpace();
  const styles = useStyles();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openCapture = useCaptureModalStore((s) => s.open);
  const { itemWidth, onLayout } = useResponsiveColumns(110, 12);
  const { t, tl } = useT();

  const closet = useWardrobeStore((s) => s.items);
  const closetLoading = useWardrobeStore((s) => s.loading);
  const closetError = useWardrobeStore((s) => s.error);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [closetShown, setClosetShown] = useState(GRID_PAGE);

  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [favReady, setFavReady] = useState(false);
  const firstFocus = useRef(true);

  const loadCloset = useCallback(async () => {
    await Promise.all([
      useWardrobeStore.getState().loadFromServer().catch(() => {}),
      fetchItemFavoriteIds()
        .then((ids) => {
          setFavIds(ids);
          setFavReady(true);
        })
        .catch(() => setFavReady(true)),
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        void loadCloset();
        return;
      }
      void loadCloset();
    }, [loadCloset]),
  );

  const filteredCloset = useMemo(() => filterCloset(closet, query, filter), [closet, query, filter]);

  const toggleFavorite = useCallback(
    (item: ClothingItem) => {
      const isFav = favIds.has(item.id);
      setFavIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      void (isFav ? removeItemFavorite(item.id) : addItemFavorite(item.id)).catch(() => {
        setFavIds((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
      });
    },
    [favIds],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PenggiStatusShade />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...hideOnScroll}
      >
        <PenggiHeader
          corner={<QuickActions tone="header" />}
          image={require("../../../assets/images/headers/wardrobe-penggi.png")}
          penggiLabel={t("header.penggi_a11y")}
          tips={[t("header.tips.wardrobe.1"), t("header.tips.wardrobe.2"), t("header.tips.wardrobe.3")]}
          title={t("discover.wardrobe.title")}
          subtitle={t("discover.wardrobe.subtitle")}
          meta={closet.length > 0 ? t("discover.wardrobe.count", { count: closet.length }) : undefined}
          right={
            <AppButton
              variant="secondary"
              label={t("discover.wardrobe.add")}
              size="md"
              icon="add"
              onPress={openCapture}
              style={styles.addBtn}
            />
          }
        />
        {switcher}

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("discover.search.placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close-circle" size={17} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t("discover.filter.all")} active={filter === null} onPress={() => setFilter(null)} />
          {WARDROBE_CATEGORIES.map((cat) => (
            <Chip key={cat} label={tl("category", cat)} active={cat === filter} onPress={() => setFilter(cat)} />
          ))}
        </ScrollView>
        <View style={styles.chipsSpacer} />

        {closetLoading && closet.length === 0 ? (
          <SkeletonGrid />
        ) : closetError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t("discover.wardrobe.error.title")}
            message={closetError}
            actionLabel={t("common.retry")}
            actionIcon="refresh"
            onAction={() => void loadCloset()}
          />
        ) : closet.length === 0 ? (
          <EmptyState
            compact
            icon="shirt-outline"
            title={t("discover.wardrobe.empty.title")}
            message={t("discover.wardrobe.empty.message")}
            actionLabel={t("discover.wardrobe.empty.action")}
            actionIcon="camera-outline"
            onAction={openCapture}
          />
        ) : filteredCloset.length === 0 ? (
          <EmptyState
            compact
            icon="filter-outline"
            title={t("discover.wardrobe.empty.filter.title")}
            message={t("discover.wardrobe.empty.filter.message")}
            actionLabel={t("discover.wardrobe.clear_filters")}
            actionIcon="close"
            onAction={() => {
              setQuery("");
              setFilter(null);
            }}
          />
        ) : (
          <>
            <View style={styles.grid} onLayout={onLayout}>
              {filteredCloset.slice(0, closetShown).map((item) => (
                <ClosetCard
                  key={item.id}
                  item={item}
                  width={itemWidth}
                  favorited={favReady && favIds.has(item.id)}
                  onPress={() => router.push(`/item/${item.id}`)}
                  onToggleFavorite={() => toggleFavorite(item)}
                />
              ))}
            </View>
            {filteredCloset.length > closetShown ? (
              <View style={styles.moreWrap}>
                <Chip
                  label={t("discover.show_more", { count: filteredCloset.length - closetShown })}
                  icon="chevron-down"
                  onPress={() => setClosetShown((n) => n + GRID_PAGE)}
                />
              </View>
            ) : null}
          </>
        )}

        <View style={styles.importCard}>
          <View style={styles.importIcon}>
            <Ionicons name="bag-handle-outline" size={20} color={theme.colors.onPrimary} />
          </View>
          <View style={styles.importBody}>
            <Text style={styles.importTitle}>{t("discover.import.title")}</Text>
            <Text style={styles.importText}>{t("discover.import.message")}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const ClosetCard = memo(function ClosetCard({
  item,
  width,
  favorited,
  onPress,
  onToggleFavorite,
}: {
  item: ClothingItem;
  width: number;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={[styles.closetCard, { width }]}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.cardImageWrap}>
        <SmartImage source={item.image_url} style={styles.closetImage} accessibilityLabel={item.name ?? undefined} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.heartButton}
        >
          <Ionicons
            name={favorited ? "heart" : "heart-outline"}
            size={16}
            color={favorited ? theme.colors.accentBright : "#FFFFFF"}
          />
        </Pressable>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.cardMeta}>
        <Text style={styles.closetName} numberOfLines={1}>
          {item.name || item.category || "Untitled"}
        </Text>
        <Text style={styles.closetMeta} numberOfLines={1}>
          {[item.category, item.color, item.size].filter(Boolean).join(" · ") || "Item"}
        </Text>
      </Pressable>
    </View>
  );
});

const useStyles = makeStyles((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, paddingBottom: 40 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, paddingHorizontal: 12, marginTop: theme.spacing.md },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: theme.colors.text, fontWeight: "500" },
  chips: { gap: 8, paddingTop: 12, paddingRight: 16 },
  chipsSpacer: { height: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-start" },
  addBtn: { paddingHorizontal: 16 },
  closetCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  cardImageWrap: { width: "100%", aspectRatio: 0.85, backgroundColor: theme.colors.surfaceAlt, position: "relative" },
  closetImage: { width: "100%", height: "100%" },
  closetImagePlaceholder: undefined as any,
  heartButton: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(20,20,20,0.45)", alignItems: "center", justifyContent: "center" },
  cardMeta: { padding: 8 },
  closetName: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  closetMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  importCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.md, padding: 14, marginTop: theme.spacing.section },
  importIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginTop: 2 },
  importBody: { flex: 1, minWidth: 0 },
  importTitle: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  importText: { fontSize: 12, lineHeight: 17, color: theme.colors.textMuted, marginTop: 3 },
  smallNote: { fontSize: 13, color: theme.colors.textMuted, paddingVertical: 8 },
  moreWrap: { alignItems: "center", paddingVertical: theme.spacing.sm },
}));