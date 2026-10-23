// C:\OOTDify\src\shared\components\SmartImage.tsx
// Shared clothing/media image with the reliability guarantees Phase 3 asks for:
//   - loading placeholder (prevents layout shift via caller-supplied aspectRatio)
//   - error fallback icon once retries are exhausted (never a blank broken box)
//   - automatic re-sign + retry when an expired signed URL 403s (see useResolvedImage)
//
// Prefer this over a bare expo-image <Image> anywhere clothing is rendered.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ComponentProps, memo } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";
import { useResolvedImage } from "../lib/useResolvedImage";

type ImageContentFit = ComponentProps<typeof Image>["contentFit"];

interface Props {
  /** A `bucket/path` storage ref or an http(s) URL. (Not named `ref` — that's reserved by React.) */
  source?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  accessibilityLabel?: string;
  /** Ionicon shown if the image cannot load after retries. */
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export const SmartImage = memo(function SmartImage({
  source,
  style,
  contentFit = "cover",
  transition = 150,
  accessibilityLabel,
  fallbackIcon = "image-outline",
}: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { uri, failed, retry } = useResolvedImage(source);

  return (
    <View style={style}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.fill}
          contentFit={contentFit}
          transition={transition}
          onError={retry}
          accessibilityLabel={accessibilityLabel ?? ""}
        />
      ) : failed ? (
        <View style={styles.fallback} accessibilityLabel="Image unavailable">
          <Ionicons name={fallbackIcon} size={22} color={theme.colors.textMuted} />
        </View>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((theme) => ({
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  fallback: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryMuted,
  },
}));