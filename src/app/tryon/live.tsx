// Live try-on preview: the camera fills the screen and the garment picked on
// Scan, cut out of its photo (no background box), follows the user's body.
// Tracking runs on the device at frame rate (MoveNet in the VisionCamera
// frame worklet → shared value → Skia mesh on the UI thread); no frame leaves
// the phone. A sheet at the bottom says what's happening. A rough placement by
// design: the full photo try-on on Scan stays the real result.
//
// "Go realistic" (opt-in, up to 1 minute, needs steady framing and the
// cut-out) streams the camera to Decart, which redraws the user wearing the
// garment. While it runs the VisionCamera is inactive (LiveKit owns the
// camera) and the AR layers are hidden; "Back to live preview" restores both.
import { Ionicons } from "@expo/vector-icons";
import { useImage } from "@shopify/react-native-skia";
import { Image } from "expo-image";
import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, AppState, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraPermission } from "react-native-vision-camera";

import { isSupportedCategory, type MeshFit } from "../../features/tryon/ar/bodyMesh";
import { CAMERA_BG, ON_CAMERA } from "../../features/tryon/ar/cameraChrome";
import { FramingGuide } from "../../features/tryon/ar/FramingGuide";
import { LiveGarmentLayer, useGarmentBounds } from "../../features/tryon/ar/LiveGarmentLayer";
import { useLiveGarment } from "../../features/tryon/ar/liveGarmentStore";
import { liveStatusKey, type CutoutState } from "../../features/tryon/ar/liveStatus";
import type { Size } from "../../features/tryon/ar/overlayGeometry";
import { useLiveTracker } from "../../features/tryon/ar/useLiveTracker";
import { useSteadyHint } from "../../features/tryon/ar/useSteadyHint";
import { getGarmentCutout, type CutoutOutcome } from "../../features/tryon/cutout";
import { RealisticConsentSheet, RealisticStage } from "../../features/tryon/realistic/RealisticView";
import { releasesCamera } from "../../features/tryon/realistic/session";
import { useRealisticSession } from "../../features/tryon/realistic/useRealisticSession";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useResolvedImage } from "../../shared/lib/useResolvedImage";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setActive(next === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

export default function LiveTryOnScreen() {
  const styles = useStyles();
  const brand = useAppTheme().colors.brand;
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const garment = useLiveGarment((s) => s.garments[0] ?? null);
  const thumb = useResolvedImage(garment?.imageRef);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [preview, setPreview] = useState<Size | null>(null);
  const [fitKind, setFitKind] = useState<MeshFit["kind"]>("no_pose");

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/scan"));

  // Nothing to try on (e.g. opened by deep link): return to Scan.
  useEffect(() => {
    if (!garment) goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garment]);

  // The cut-out (transparent PNG), keyed by garment so a stale result is ignored.
  const garmentKey = garment ? `${garment.id}|${garment.imageRef}` : null;
  const [cutout, setCutout] = useState<{ key: string; outcome: CutoutOutcome } | null>(null);
  useEffect(() => {
    if (!garment || !garmentKey) return;
    let cancelled = false;
    void getGarmentCutout({ id: garment.id, image_url: garment.imageRef }).then((outcome) => {
      if (!cancelled) setCutout({ key: garmentKey, outcome });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmentKey]);
  const outcome = cutout?.key === garmentKey ? cutout.outcome : null;
  const readyUri = outcome?.status === "ready" ? outcome.uri : null;
  const [imageFailedUri, setImageFailedUri] = useState<string | null>(null);
  const garmentImage = useImage(readyUri, () => setImageFailedUri(readyUri));
  const bounds = useGarmentBounds(garmentImage);

  const cutoutState: CutoutState =
    outcome === null
      ? "loading"
      : outcome.status !== "ready" || imageFailedUri === readyUri
        ? "failed"
        : garmentImage
          ? "ready"
          : "loading";

  // Realistic mode. While it holds the camera, the preview and tracker pause.
  const realistic = useRealisticSession(cutoutState === "ready" ? readyUri : null, facing);
  const released = releasesCamera(realistic.phase);
  // Leaving the screen (blur) ends any open session; the hook's unmount
  // cleanup covers the back button.
  const stopRealistic = realistic.stop;
  useFocusEffect(useCallback(() => stopRealistic, [stopRealistic]));

  const category = garment?.category ?? null;
  const supported = isSupportedCategory(category);
  const live = useLiveTracker({
    active:
      focused && appActive && !released && !!garment && hasPermission && supported && cutoutState === "ready",
    facing,
    preview,
    kinds: garment?.kind ? [garment.kind] : [],
  });

  const statusKey = liveStatusKey(supported ? fitKind : "unsupported", live.tracker, cutoutState);
  const status = statusKey ? t(statusKey) : null;

  // The framing guide takes over once nothing else needs saying. A status line
  // (tracker or cut-out trouble, unsupported garment) outranks the hint text.
  const guideOn = hasPermission && supported && cutoutState === "ready" && statusKey === null && !released;
  const steady = useSteadyHint(guideOn ? live.hint : "no_person");

  // Android announces via accessibilityLiveRegion; iOS needs an explicit call.
  useEffect(() => {
    if (status && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(status);
  }, [status]);

  // Enabled only while framing is steady "good" and the cut-out is ready.
  const canGoRealistic = steady.readyToShoot && cutoutState === "ready" && realistic.phase === "idle";

  if (!garment) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPreview({ width, height });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.stage} onLayout={onLayout}>
        {hasPermission ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={facing}
            isActive={focused && appActive && !released}
            outputs={[live.frameOutput]}
            orientationSource="interface"
          />
        ) : null}
        {hasPermission && cutoutState === "ready" && !released ? (
          <LiveGarmentLayer
            image={garmentImage}
            bounds={bounds}
            category={category}
            keypoints={live.keypoints}
            facing={facing}
            onFitKind={setFitKind}
          />
        ) : null}
        {guideOn ? <FramingGuide hint={steady.shown} topOffset={insets.top + 64} /> : null}
        <RealisticStage session={realistic} facing={facing} topOffset={insets.top + 16} />

        <View style={[styles.topRow, { top: insets.top + 8 }]}>
          <CameraButton icon="chevron-back" label={t("tryon.live.back_a11y")} onPress={goBack} />
          {hasPermission && !released ? (
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
          {thumb.uri ? (
            <Image source={{ uri: thumb.uri }} style={styles.thumb} contentFit="cover" onError={thumb.retry} />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={styles.garmentText}>
            <Text style={styles.name} numberOfLines={1}>
              {garment.name}
            </Text>
            {hasPermission ? (
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {status ?? " "}
              </Text>
            ) : (
              <Text style={styles.status}>{t("tryon.live.permission")}</Text>
            )}
          </View>
        </View>

        {!hasPermission ? (
          <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={() => void requestPermission()}>
            <Text style={styles.primaryBtnText}>{t("tryon.live.grant")}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={goBack}>
            <Text style={styles.primaryBtnText}>{t("tryon.live.full_tryon")}</Text>
          </Pressable>
        )}
        {hasPermission && supported ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("tryon.live.realistic_hint")}
            accessibilityState={{ disabled: !canGoRealistic }}
            disabled={!canGoRealistic}
            style={[styles.realisticBtn, !canGoRealistic && styles.realisticBtnOff]}
            onPress={realistic.start}
          >
            <Ionicons name="sparkles-outline" size={18} color={brand} />
            <View style={styles.realisticBtnLabel}>
              <Text style={styles.realisticBtnText}>{t("tryon.live.go_realistic")}</Text>
              <Text style={styles.realisticHint}>{t("tryon.live.realistic_hint")}</Text>
            </View>
          </Pressable>
        ) : null}
        <Text style={styles.disclaimer}>{t("tryon.live.disclaimer")}</Text>
      </View>
      <RealisticConsentSheet session={realistic} />
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
  realisticBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  realisticBtnOff: { opacity: 0.45 },
  realisticBtnLabel: { flex: 1, gap: 1 },
  realisticBtnText: { color: theme.colors.brand, fontWeight: "600", fontSize: 15 },
  realisticHint: { ...theme.typography.caption, color: theme.colors.textMuted },
  disclaimer: { ...theme.typography.caption, color: theme.colors.textMuted },
}));
