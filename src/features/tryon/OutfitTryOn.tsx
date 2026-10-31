// C:\OOTDify\src\features\tryon\OutfitTryOn.tsx
// "See it worn" on a saved outfit: pick who wears it (you, from your own
// photo, or one of the preset models), and Penggi's AI draws them in exactly
// these pieces (POST /api/tryon, Gemini on the backend). The picture can be
// kept on the outfit. A body the AI drew from a face photo, or a preset model,
// is always labelled as such.
//
// Set in the same sky as the tab headers (useHeaderSky: pale periwinkle in
// light mode, deep denim at night), so it reads as Penggi's studio.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";

import {
  ApiError,
  createTryOnJob,
  listBodyPhotos,
  pollTryOnJob,
  uploadBodyPhoto,
  type TryOnJob,
} from "../../services/aiApi";
import { AppButton } from "../../shared/components/AppButton";
import { useHeaderSky, type HeaderSky } from "../../shared/components/PenggiHeader";
import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useT } from "../../shared/i18n/useT";
import { mixHex } from "../../shared/lib/mixHex";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { toast } from "../../shared/lib/toast";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { attachTryOnToOutfit } from "../clothing/service";
import { pickAvatarPhoto, type AvatarSource } from "../profile/avatar";
import { PRESET_PHOTOS } from "./presetPhotos";
import { PRESET_IDS, PRESET_NAMES, resultBadge, tryOnRequest, type PresetId, type Wearer } from "./presets";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; name: string | null }
  | { kind: "done"; job: TryOnJob | null; uri: string; saved: boolean; name: string | null }
  | { kind: "error"; message: string };

/** Casting card: a 3:4 portrait, like a model agency's comp card. */
const CARD_W = 104;
const CARD_H = Math.round((CARD_W * 4) / 3);
const THUMB = 46;

export function OutfitTryOn({
  outfitId,
  clothingIds,
  pieceImages = [],
  savedResultUri,
  onSaved,
}: {
  outfitId: string;
  clothingIds: string[];
  /** The outfit's piece images (storage refs or URLs), shown as what they'll wear. */
  pieceImages?: (string | null)[];
  /** The picture already kept on this outfit, if any. */
  savedResultUri: string | null;
  onSaved?: (resultUrl: string) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const reduceMotion = useReduceMotion();
  const sky = useHeaderSky();
  const ink = { color: sky.ink };
  const inkMuted = { color: sky.inkMuted };

  const [wearer, setWearer] = useState<Wearer>({ kind: "preset", id: "ava" });
  const [you, setYou] = useState<{ id: string; uri: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    savedResultUri ? { kind: "done", job: null, uri: savedResultUri, saved: true, name: null } : { kind: "idle" },
  );
  const [saving, setSaving] = useState(false);

  // The newest photo the user already gave try-on, so "You" is one tap.
  useEffect(() => {
    let alive = true;
    listBodyPhotos()
      .then((photos) => {
        const newest = [...photos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (alive && newest) setYou({ id: newest.id, uri: newest.signedUrl });
      })
      .catch(() => {
        // No saved photo is fine: "You" then asks for one.
      });
    return () => {
      alive = false;
    };
  }, []);

  // A slow breath on Penggi while the AI draws.
  const [pulse] = useState(() => new Animated.Value(0));
  const working = phase.kind === "working";
  useEffect(() => {
    if (!working || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [working, reduceMotion, pulse]);

  const wearerName = (w: Wearer) => (w.kind === "preset" ? PRESET_NAMES[w.id] : null);
  const youWearer: Wearer = { kind: "you", bodyPhotoId: you?.id ?? null };
  const active: Wearer = wearer.kind === "you" ? youWearer : wearer;
  const request = tryOnRequest(active, clothingIds);

  const addPhoto = async (source: AvatarSource) => {
    const picked = await pickAvatarPhoto(source, "free");
    if (!picked) return;
    setChecking(true);
    try {
      const { body_photo, signedUrl } = await uploadBodyPhoto(picked.uri);
      setYou({ id: body_photo.id, uri: signedUrl ?? picked.uri });
      setWearer({ kind: "you", bodyPhotoId: body_photo.id });
    } catch (e) {
      toast.error(t("tryon.outfit.photo_error"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setChecking(false);
    }
  };

  const run = async () => {
    if (!request) return;
    const name = wearerName(active);
    setPhase({ kind: "working", name });
    try {
      const created = await createTryOnJob(request);
      const job = await pollTryOnJob(created.id);
      if (job.status !== "completed" || !job.result_url) {
        setPhase({ kind: "error", message: job.error || t("tryon.outfit.failed") });
        return;
      }
      const uri = job.resultSignedUrl ?? (await resolveMediaUrl(job.result_url, 900));
      if (!uri) {
        setPhase({ kind: "error", message: t("tryon.outfit.failed") });
        return;
      }
      setPhase({ kind: "done", job, uri, saved: false, name });
    } catch (e) {
      const message =
        e instanceof ApiError && e.kind === "timeout"
          ? t("tryon.outfit.timeout")
          : e instanceof Error && e.message
            ? e.message
            : t("tryon.outfit.failed");
      setPhase({ kind: "error", message });
    }
  };

  const save = async () => {
    if (phase.kind !== "done" || !phase.job?.result_url || saving) return;
    setSaving(true);
    try {
      await attachTryOnToOutfit(outfitId, phase.job.id, phase.job.result_url);
      setPhase({ ...phase, saved: true });
      onSaved?.(phase.job.result_url);
      toast.success(t("tryon.outfit.saved_toast"));
    } catch {
      toast.error(t("tryon.outfit.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const badge =
    phase.kind === "done"
      ? phase.job
        ? t(`tryon.outfit.badge.${resultBadge(phase.job)}` as const)
        : t("tryon.outfit.badge.saved")
      : null;

  const ctaLabel =
    active.kind === "you" ? t("tryon.outfit.cta_you") : t("tryon.outfit.cta", { name: PRESET_NAMES[active.id] });

  return (
    <View style={[styles.card, { backgroundColor: sky.sky[0] }]}>
      <Text style={[styles.title, ink]} accessibilityRole="header">
        {t("tryon.outfit.title")}
      </Text>
      <Text style={[styles.subtitle, inkMuted]}>{t("tryon.outfit.subtitle")}</Text>

      {/* The stage: what the AI drew, or Penggi at work. */}
      {phase.kind === "done" ? (
        <View style={[styles.stage, { backgroundColor: sky.sky[1] }]}>
          <Image
            source={{ uri: phase.uri }}
            style={styles.stageImage}
            contentFit="cover"
            transition={200}
            accessibilityLabel={t("tryon.outfit.result_a11y", { name: phase.name ?? t("tryon.outfit.you") })}
          />
          {badge ? (
            <View style={styles.badge}>
              <Ionicons
                name={phase.saved ? "bookmark" : "sparkles"}
                size={12}
                color={theme.colors.onFeature}
              />
              <Text style={styles.badgeText}>{phase.saved && phase.job ? t("tryon.outfit.badge.saved") : badge}</Text>
            </View>
          ) : null}
        </View>
      ) : working ? (
        <View style={[styles.stage, styles.stageWorking, { backgroundColor: sky.sky[1] }]} accessibilityLiveRegion="polite">
          <Animated.View
            style={{
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
            }}
          >
            <Image
              source={require("../../../assets/images/headers/thinking-penggi.png")}
              style={styles.thinking}
              contentFit="contain"
            />
          </Animated.View>
          <Text style={[styles.workingTitle, ink]}>
            {phase.name ? t("tryon.outfit.working", { name: phase.name }) : t("tryon.outfit.working_you")}
          </Text>
          <Text style={[styles.workingHint, inkMuted]}>{t("tryon.outfit.working_hint")}</Text>
        </View>
      ) : null}

      {phase.kind === "error" ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={16} color={sky.dark ? theme.colors.accentBright : theme.colors.danger} />
          <Text style={[styles.errorText, ink]}>{phase.message}</Text>
        </View>
      ) : null}

      {phase.kind === "done" ? (
        <View style={styles.doneActions}>
          {phase.job && !phase.saved ? (
            <AppButton
              label={t("tryon.outfit.save")}
              icon="bookmark-outline"
              variant="secondary"
              size="md"
              loading={saving}
              onPress={() => void save()}
              style={styles.flex}
            />
          ) : null}
          <AppButton
            label={t("tryon.outfit.again")}
            icon="people-outline"
            variant="secondary"
            size="md"
            onPress={() => setPhase({ kind: "idle" })}
            style={styles.flex}
          />
        </View>
      ) : !working ? (
        <>
          {/* Who wears it: a casting row of portrait cards. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.wearers}
            accessibilityLabel={t("tryon.outfit.wearers_a11y")}
          >
            <WearerTile
              selected={wearer.kind === "you"}
              name={t("tryon.outfit.you")}
              detail={you ? t("tryon.outfit.you_ready") : t("tryon.outfit.you_add")}
              photo={you?.uri ? { uri: you.uri } : null}
              icon={you ? undefined : "camera-outline"}
              sky={sky}
              onPress={() => setWearer(youWearer)}
            />
            {PRESET_IDS.map((id) => (
              <WearerTile
                key={id}
                selected={wearer.kind === "preset" && wearer.id === id}
                name={PRESET_NAMES[id]}
                detail={t(`tryon.model.${id}` as const)}
                preset={id}
                photo={PRESET_PHOTOS[id] ?? null}
                sky={sky}
                onPress={() => setWearer({ kind: "preset", id })}
              />
            ))}
          </ScrollView>

          {wearer.kind === "you" ? (
            <View style={styles.youPanel}>
              <Text style={[styles.youHint, inkMuted]}>{t("tryon.outfit.you_hint")}</Text>
              <View style={styles.youButtons}>
                <AppButton
                  label={t("tryon.outfit.take_photo")}
                  icon="camera-outline"
                  variant="secondary"
                  size="md"
                  disabled={checking}
                  onPress={() => void addPhoto("camera")}
                  style={styles.flex}
                />
                <AppButton
                  label={t("tryon.outfit.choose_photo")}
                  icon="images-outline"
                  variant="secondary"
                  size="md"
                  disabled={checking}
                  onPress={() => void addPhoto("library")}
                  style={styles.flex}
                />
              </View>
              {checking ? <Text style={[styles.youHint, inkMuted]}>{t("tryon.outfit.checking")}</Text> : null}
            </View>
          ) : null}

          {/* What they'll wear: the outfit's pieces, to check the picture against. */}
          {pieceImages.length ? (
            <View style={styles.wearing}>
              <View style={styles.thumbs}>
                {pieceImages.slice(0, 6).map((ref, i) => (
                  <PieceThumb key={`${ref ?? "none"}-${i}`} imageRef={ref} />
                ))}
              </View>
              <Text style={[styles.wearingText, inkMuted]} numberOfLines={2}>
                {t("tryon.outfit.wearing", { count: pieceImages.length })}
              </Text>
            </View>
          ) : null}

          {clothingIds.length === 0 ? (
            <Text style={[styles.youHint, inkMuted]}>{t("tryon.outfit.no_pieces")}</Text>
          ) : (
            <AppButton
              label={phase.kind === "error" ? t("tryon.outfit.retry") : ctaLabel}
              icon="sparkles"
              variant="secondary"
              disabled={!request || checking}
              onPress={() => void run()}
              style={styles.cta}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

/** How far each drawn card leans from deep denim toward the brand blue. */
const CARD_MIX: Record<PresetId, number> = { ava: 0.25, leo: 0.4, mia: 0.55, kai: 0.32, rin: 0.48, sam: 0.62 };

function WearerTile({
  selected,
  name,
  detail,
  preset,
  photo,
  icon,
  sky,
  onPress,
}: {
  selected: boolean;
  name: string;
  detail: string;
  preset?: PresetId;
  /** A portrait (bundled asset or remote uri); a drawn card without one. */
  photo?: number | { uri: string } | null;
  icon?: keyof typeof Ionicons.glyphMap;
  sky: HeaderSky;
  onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const fill = mixHex(theme.colors.feature, theme.colors.brand, preset ? CARD_MIX[preset] : 0.5);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.88 }]}
    >
      <View
        style={[styles.portrait, { backgroundColor: fill, borderColor: selected ? theme.colors.accent : "transparent" }]}
      >
        {photo ? (
          <Image source={photo} style={styles.portraitPhoto} contentFit="cover" transition={150} />
        ) : icon ? (
          <View style={styles.portraitAdd}>
            <Ionicons name={icon} size={26} color={theme.colors.onFeature} />
          </View>
        ) : (
          // No portrait yet: a figure on the studio card.
          <Ionicons
            name="person"
            size={CARD_W * 0.92}
            color={mixHex(fill, theme.colors.onFeature, 0.22)}
            style={styles.figure}
          />
        )}
        {selected ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={14} color={theme.colors.onFeature} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileName, { color: sky.ink }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.tileDetail, { color: sky.inkMuted }]} numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

function PieceThumb({ imageRef }: { imageRef: string | null }) {
  const styles = useStyles();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!imageRef) return;
    let alive = true;
    void resolveMediaUrl(imageRef, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [imageRef]);
  return <View style={styles.thumb}>{uri ? <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" /> : null}</View>;
}

const useStyles = makeStyles((theme) => ({
  card: {
    borderRadius: 28,
    padding: 18,
    gap: 12,
  },
  title: { fontSize: 21, fontWeight: "700", letterSpacing: -0.5, color: theme.colors.onFeature },
  subtitle: { marginTop: -6, fontSize: 13.5, lineHeight: 19, color: theme.colors.onFeatureMuted },
  stage: {
    borderRadius: 20,
    overflow: "hidden",
    aspectRatio: 3 / 4,
  },
  stageImage: { width: "100%", height: "100%" },
  stageWorking: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 6 },
  thinking: { width: 150, height: 150 },
  workingTitle: { marginTop: 8, fontSize: 17, fontWeight: "700", color: theme.colors.onFeature, textAlign: "center" },
  workingHint: { fontSize: 13, lineHeight: 18, color: theme.colors.onFeatureMuted, textAlign: "center" },
  badge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.feature,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: theme.colors.onFeature },
  doneActions: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  wearers: { gap: 12, paddingRight: 4 },
  tile: { width: CARD_W },
  portrait: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    borderWidth: 2.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  portraitPhoto: { width: "100%", height: "100%" },
  portraitAdd: {
    flex: 1,
    alignSelf: "stretch",
    margin: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.onFeatureMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  figure: { marginBottom: -CARD_W * 0.14 },
  check: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  tileName: { marginTop: 8, fontSize: 14.5, fontWeight: "700", color: theme.colors.onFeature },
  tileDetail: { marginTop: 1, fontSize: 11.5, lineHeight: 15, color: theme.colors.onFeatureMuted },
  wearing: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumbs: { flexDirection: "row" },
  thumb: {
    width: THUMB,
    height: THUMB + 8,
    marginRight: -10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    overflow: "hidden",
    backgroundColor: theme.colors.primaryMuted,
  },
  thumbImage: { width: "100%", height: "100%" },
  wearingText: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 18 },
  youPanel: { gap: 8 },
  youHint: { fontSize: 13, lineHeight: 18, color: theme.colors.onFeatureMuted },
  youButtons: { flexDirection: "row", gap: 10 },
  errorRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  errorText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: theme.colors.onFeature },
  cta: { marginTop: 2 },
}));
