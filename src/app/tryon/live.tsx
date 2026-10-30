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
import { Image } from "expo-image";
import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, AppState, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraPermission } from "react-native-vision-camera";

import { CAMERA_BG, ON_CAMERA } from "../../features/tryon/ar/cameraChrome";
import { FramingGuide } from "../../features/tryon/ar/FramingGuide";
import { useLiveGarment, type LiveGarment } from "../../features/tryon/ar/liveGarmentStore";
import { liveStatus, type CutoutState } from "../../features/tryon/ar/liveStatus";
import { garmentBounds, LiveOutfitLayer, useSkImages, type OutfitLayerItem } from "../../features/tryon/ar/LiveOutfitLayer";
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
  const garments = useLiveGarment((s) => s.garments);
  const first = garments.length > 0 ? garments[0] : null;
  const thumb = useResolvedImage(first?.imageRef);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [preview, setPreview] = useState<Size | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/scan"));

  // Nothing to try on (e.g. opened by deep link): return to Scan.
  useEffect(() => {
    if (garments.length === 0) goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garments]);

  // The cut-outs (transparent PNGs), fetched in parallel and keyed by item so a
  // stale result is ignored. Unplaceable items are never cut out.
  const keyOf = (g: LiveGarment) => `${g.id}|${g.imageRef}`;
  const placeable = garments.filter((g) => g.kind !== null);
  const placeableKey = placeable.map(keyOf).join(",");
  const [cutouts, setCutouts] = useState<Record<string, CutoutOutcome>>({});
  useEffect(() => {
    let cancelled = false;
    for (const g of placeable) {
      void getGarmentCutout({ id: g.id, image_url: g.imageRef }).then((outcome) => {
        if (!cancelled) setCutouts((prev) => ({ ...prev, [keyOf(g)]: outcome }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeableKey]);
  const readyUris = placeable.flatMap((g) => {
    const o = cutouts[keyOf(g)];
    return o?.status === "ready" ? [o.uri] : [];
  });
  const images = useSkImages(readyUris);

  const stateOf = (g: LiveGarment): CutoutState => {
    const o = cutouts[keyOf(g)];
    if (!o) return "loading";
    if (o.status !== "ready") return "failed";
    const image = images[o.uri];
    return image === "failed" ? "failed" : image ? "ready" : "loading";
  };
  const readyUriOf = (g: LiveGarment): string | null => {
    const o = cutouts[keyOf(g)];
    return o?.status === "ready" && stateOf(g) === "ready" ? o.uri : null;
  };

  // The drawable outfit: placeable items whose cut-out image is loaded.
  const layerItems = useMemo<OutfitLayerItem[]>(
    () =>
      placeable.flatMap((g) => {
        const uri = readyUriOf(g);
        const image = uri ? images[uri] : undefined;
        if (!g.kind || !image || image === "failed") return [];
        return [{ id: g.id, kind: g.kind, image, bounds: garmentBounds(image) }];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeableKey, cutouts, images],
  );
  const ready = layerItems.length > 0;

  // Realistic mode redraws one item: the main clothing piece for now.
  const realisticItem = mainRealisticItem(placeable.filter((g) => readyUriOf(g) !== null));
  const realistic = useRealisticSession(realisticItem ? readyUriOf(realisticItem) : null, facing);
  const released = releasesCamera(realistic.phase);
  // Leaving the screen (blur) ends any open session; the hook's unmount
  // cleanup covers the back button.
  const stopRealistic = realistic.stop;
  useFocusEffect(useCallback(() => stopRealistic, [stopRealistic]));

  const live = useLiveTracker({
    active: focused && appActive && !released && hasPermission && ready,
    facing,
    preview,
    kinds: layerItems.map((i) => i.kind),
  });

  const outfitStatus = liveStatus(
    garments.map((g) => ({ name: g.name, placeable: g.kind !== null, cutout: g.kind ? stateOf(g) : "failed" })),
    live.tracker,
  );
  const status = outfitStatus ? t(outfitStatus.key, { names: outfitStatus.names ?? "" }) : null;

  // The framing guide takes over once nothing else needs saying. A status line
  // (tracker or cut-out trouble, nothing placeable) outranks the hint text; a
  // "can't show X" note doesn't stop the rest of the outfit being framed.
  const quiet = outfitStatus === null || outfitStatus.key === "tryon.live.cant_show";
  const guideOn = hasPermission && ready && quiet && !released;
  const steady = useSteadyHint(guideOn ? live.hint : "no_person");

  // Android announces via accessibilityLiveRegion; iOS needs an explicit call.
  useEffect(() => {
    if (status && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(status);
  }, [status]);

  // Enabled only while framing is steady "good" and an item's cut-out is ready.
  const canGoRealistic = steady.readyToShoot && realisticItem !== null && realistic.phase === "idle";

  if (!first) return null;

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
        {hasPermission && ready && !released ? (
          <LiveOutfitLayer items={layerItems} keypoints={live.keypoints} facing={facing} />
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
              {garments.length > 1 ? t("tryon.live.items_count", { count: garments.length }) : first.name}
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
        {hasPermission && placeable.length > 0 ? (
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

/** The item realistic mode redraws: a dress, else a top, else pants, else the first ready item. */
function mainRealisticItem(ready: LiveGarment[]): LiveGarment | null {
  for (const kind of ["dress", "upper", "bottom", "outer"] as const) {
    const found = ready.find((g) => g.kind === kind);
    if (found) return found;
  }
  return ready.length > 0 ? ready[0] : null;
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
