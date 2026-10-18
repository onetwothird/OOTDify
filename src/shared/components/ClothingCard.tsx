// C:\OOTDify\src\shared\components\ClothingCard.tsx
// Catalog item card: image, name, category, favorite toggle.
// NOTE: OOTDify is a styling advisor, not a store — prices are deliberately
// never shown; the row's meta slot carries the garment category instead.
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../config/theme";
import { SmartImage } from "./SmartImage";

export interface ClothingCardItem {
  id: string;
  name?: string | null;
  price?: number | null;
  currency?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  occasion?: string[];
  category?: string | null;
}

interface Props {
  item: ClothingCardItem;
  width: number;
  favorited?: boolean;
  onPress?: () => void;
  onToggleFavorite?: () => void;
}

export const ClothingCard = memo(function ClothingCard({
  item,
  width,
  favorited = false,
  onPress,
  onToggleFavorite,
}: Props) {
  const imageRef = (item.thumbnail_url || item.image_url || "") as string;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.cardPressed,
      ]}
    >
      <SmartImage source={imageRef} style={styles.image} accessibilityLabel={item.name ?? undefined} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {item.category ?? ""}
          </Text>
          {onToggleFavorite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                favorited ? "Remove from favorites" : "Add to favorites"
              }
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Ionicons
                name={favorited ? "heart" : "heart-outline"}
                size={18}
                color={favorited ? theme.colors.primary : theme.colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cardPressed: { opacity: 0.92 },
  image: {
    width: "100%",
    aspectRatio: 0.8,
    backgroundColor: theme.colors.primaryMuted,
  },
  body: {
    padding: 10,
    gap: 6,
    minHeight: 66,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    flexShrink: 1,
  },
});