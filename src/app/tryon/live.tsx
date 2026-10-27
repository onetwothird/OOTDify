// Live try-on preview: the camera fills the screen, the garment picked on
// Scan is hung from the user's pose points (marked with chalk ticks), and a
// sheet at the bottom says what's happening. A rough placement by design —
// the full photo try-on on Scan stays the real result.
import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, LayoutChangeEvent, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChalkMarks } from "../../features/tryon/ar/ChalkMarks";
import { GarmentOverlay } from "../../features/tryon/ar/GarmentOverlay";
import { useLiveGarment } from "../../features/tryon/ar/liveGarmentStore";
import { liveStatusKey } from "../../features/tryon/ar/liveStatus";
import { pickLivePictureSize } from "../../features/tryon/ar/pictureSize";
import {
  Anchors,
  garmentFit,
  OverlayFit,
  photoToPreview,
  Point,
  pointToPreview,
  Size,
} from "../../features/tryon/ar/overlayGeometry";
import { useLivePose } from "../../features/tryon/ar/useLivePose";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useResolvedImage } from "../../shared/lib/useResolvedImage";
import { makeStyles } from "../../shared/theme/makeStyles";

// Camera chrome sits on the live feed, which isn't themed.
const ON_CAMERA = "#FFFFFF";
const CAMERA_BG = "#000000";

export default function LiveTryOnScreen() {
  const styles = useStyles();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const garment = useLiveGarment((s) => s.garment);
  const image = useResolvedImage(garment?.imageRef);
  const [perm, requestPerm] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [preview, setPreview] = useState<Size | null>(null);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const cameraRef = useRef<CameraView | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/scan"));

  // Nothing to try on (e.g. opened by deep link): return to Scan.
  useEffect(() => {
    if (!garment) goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garment]);

  const category = garment?.category ?? null;
  const supported = garmentFit(category, []).kind !== "unsupported";
  const loop = useLivePose(cameraRef, !!garment && !!perm?.granted && supported, facing);

  const fit: OverlayFit = useMemo(() => {
    if (!supported) return { kind: "unsupported" };
    return loop.pose ? garmentFit(category, loop.pose.keypoints) : { kind: "no_pose" };
  }, [supported, category, loop.pose]);

  const mirrored = facing === "front";
  // Memoized: ChalkMarks keeps the last anchors in state by identity.
  const { rect, anchors } = useMemo(() => {
    if (fit.kind !== "rect" || !loop.pose || !preview) return { rect: null, anchors: null };
    const photo = { width: loop.pose.imageWidth, height: loop.pose.imageHeight };
    const toPreview = (pair: [Point, Point]): [Point, Point] => [
      pointToPreview(pair[0], photo, preview, mirrored),
      pointToPreview(pair[1], photo, preview, mirrored),
    ];
    const placedAnchors: Anchors = { top: toPreview(fit.anchors.top), bottom: toPreview(fit.anchors.bottom) };
    return { rect: photoToPreview(fit.rect, photo, preview, mirrored), anchors: placedAnchors };
  }, [fit, loop.pose, preview, mirrored]);
  const faded = loop.lost;

  const statusKey = liveStatusKey(category, fit, loop);
  const status = statusKey ? t(statusKey) : null;

  // Android announces via accessibilityLiveRegion; iOS needs an explicit call.
  useEffect(() => {
    if (status && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(status);
  }, [status]);

  if (!garment) return null;

  // Small 4:3 stills: fast to capture, and aligned with the preview stream.
  const onCameraReady = () => {
    cameraRef.current
      ?.getAvailablePictureSizesAsync()
      .then((sizes) => setPictureSize(pickLivePictureSize(sizes)))
      .catch(() => setPictureSize(undefined));
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPreview({ width, height });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.stage} onLayout={onLayout}>
        {perm?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            pictureSize={pictureSize}
            onCameraReady={onCameraReady}
            animateShutter={false}
          />
        ) : null}
        {image.uri ? <GarmentOverlay imageUrl={image.uri} rect={rect} faded={faded} /> : null}
        <ChalkMarks anchors={anchors} faded={faded} />

        <View style={[styles.topRow, { top: insets.top + 8 }]}>
          <CameraButton icon="chevron-back" label={t("tryon.live.back_a11y")} onPress={goBack} />
          {perm?.granted ? (
            <CameraButton
              icon="camera-reverse-outline"
              label={t("tryon.live.flip_a11y")}
              onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
            />
          ) : null}
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.garmentRow}>
          {image.uri ? (
            <Image source={{ uri: image.uri }} style={styles.thumb} contentFit="cover" onError={image.retry} />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={styles.garmentText}>
            <Text style={styles.name} numberOfLines={1}>
              {garment.name}
            </Text>
            {perm?.granted ? (
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {status ?? " "}
              </Text>
            ) : (
              <Text style={styles.status}>{t("tryon.live.permission")}</Text>
            )}
          </View>
        </View>

        {perm && !perm.granted ? (
          <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={() => void requestPerm()}>
            <Text style={styles.primaryBtnText}>{t("tryon.live.grant")}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={goBack}>
            <Text style={styles.primaryBtnText}>{t("tryon.live.full_tryon")}</Text>
          </Pressable>
        )}
        <Text style={styles.disclaimer}>{t("tryon.live.disclaimer")}</Text>
      </View>
    </View>
  );
}

function CameraButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.camBtn} hitSlop={6}>
      <View style={styles.camBtnScrim} />
      <Ionicons name={icon} size={22} color={ON_CAMERA} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: CAMERA_BG },
  stage: { flex: 1, overflow: "hidden", backgroundColor: CAMERA_BG },
  camera: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  topRow: {
    position: "absolute",
    left: theme.spacing.page,
    right: theme.spacing.page,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  camBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  camBtnScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: CAMERA_BG, opacity: 0.45 },
  sheet: {
    marginTop: -theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: 12,
  },
  garmentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 44, height: 44, borderRadius: theme.borderRadius.sm, backgroundColor: theme.colors.surfaceAlt },
  garmentText: { flex: 1, gap: 2 },
  name: { ...theme.typography.subheading, color: theme.colors.text },
  status: { ...theme.typography.caption, color: theme.colors.textMuted },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 15 },
  disclaimer: { ...theme.typography.caption, color: theme.colors.textMuted },
}));
