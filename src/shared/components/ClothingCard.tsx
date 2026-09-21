// C:\OOTDify\src\shared\components\ClothingCard.tsx
// Catalog item card: image, name, price, favorite toggle.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../config/theme";
import { resolveMediaUrl } from "../lib/storageUrl";

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

/** Resolve a stored ref (or return http(s)) to a renderable URL once. */
function useResolvedImage(ref: string): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!ref) {
      setUri(null);
      return;
    }
    resolveMediaUrl(ref, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [ref]);
  return uri;
}

export const ClothingCard = memo(function ClothingCard({
  item,
  width,
  favorited = false,
  onPress,
  onToggleFavorite,
}: Props) {
  const imageRef = (item.thumbnail_url || item.image_url || "") as string;
  const uri = useResolvedImage(imageRef);
  const price = item.price != null ? Number(item.price) : null;
  const currency = item.currency ?? "USD";

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
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          accessibilityLabel=""
        />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          {price != null ? (
            <Text style={styles.price}>
              {currency === "USD" ? "$" : `${currency} `}
              {price.toFixed(2)}
            </Text>
          ) : (
            <Text style={styles.price}>{item.category ?? ""}</Text>
          )}
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
  imagePlaceholder: {
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
  price: {
    fontSize: 12,
    color: theme.colors.textMuted,
    flexShrink: 1,
  },
});