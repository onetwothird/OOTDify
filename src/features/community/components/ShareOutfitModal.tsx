// C:\OOTDify\src\features\community\components\ShareOutfitModal.tsx
// New post for the community feed: a caption, up to four photos from the
// device, and optionally one of your saved outfits — any of the three is
// enough. The service copies an outfit's private images into the public
// community bucket; nothing in your private wardrobe becomes readable.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { fetchSavedOutfits, SavedOutfit } from "../../clothing/service";
import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { SmartImage } from "../../../shared/components/SmartImage";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useT } from "../../../shared/i18n/useT";
import { supabase } from "../../../shared/lib/supabase";
import { shareOutfit } from "../service";

/** Resolve an outfit's piece images for the picker preview. */
async function previewRefs(outfits: SavedOutfit[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(outfits.flatMap((o) => o.clothing_ids)));
  const map = new Map<string, string | null>();
  if (!ids.length) return map;
  const [{ data: catalog }, { data: items }] = await Promise.all([
    supabase.from("clothing").select("id, thumbnail_url, image_url").in("id", ids),
    supabase.from("clothing_items").select("id, image_url").in("id", ids),
  ]);
  for (const row of (catalog ?? []) as {
    id: string;
    thumbnail_url: string | null;
    image_url: string;
  }[]) {
    map.set(row.id, row.thumbnail_url || row.image_url);
  }
  for (const row of (items ?? []) as { id: string; image_url: string | null }[]) {
    if (!map.has(row.id)) map.set(row.id, row.image_url);
  }
  return map;
}

const MAX_PHOTOS = 4;

export function ShareOutfitModal({
  visible,
  onClose,
  onShared,
}: {
  visible: boolean;
  onClose: () => void;
  onShared: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [outfits, setOutfits] = useState<SavedOutfit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Map<string, string | null>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);

  const reset = () => {
    setSelectedId(null);
    setCaption("");
    setPhotos([]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const load = useCallback(async () => {
    try {
      const rows = await fetchSavedOutfits();
      setOutfits(rows);
      setLoadError(null);
      setRefs(await previewRefs(rows));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("community.share_modal.error.load"));
    }
  }, [t]);

  // Load outfits when modal becomes visible — inline async in effect to avoid setState-in-effect lint error.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchSavedOutfits();
        if (cancelled) return;
        setOutfits(rows);
        setLoadError(null);
        setRefs(await previewRefs(rows));
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : t("community.share_modal.error.load"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, t]);

  const selected = outfits?.find((o) => o.id === selectedId) ?? null;
  const canPost = Boolean(caption.trim() || photos.length || selected) && !sharing;

  const addPhotos = async () => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked = result.assets.map((a) => a.uri).slice(0, room);
    setPhotos((prev) => [...prev, ...picked]);
    setError(null);
  };

  const share = async () => {
    if (!canPost) return;
    setSharing(true);
    setError(null);
    try {
      await shareOutfit({
        outfitId: selected?.id ?? null,
        title: selected?.name ?? null,
        caption,
        clothingIds: selected?.clothing_ids ?? [],
        photoUris: photos,
      });
      reset();
      onShared();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("community.share_modal.error.share"));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      busy={sharing}
      icon="create"
      title={t("community.share_modal.title")}
      footer={
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <AppButton
            label={t("community.share_modal.submit")}
            icon="cloud-upload-outline"
            loading={sharing}
            disabled={!canPost}
            onPress={() => void share()}
          />
          <Text style={styles.privacyNote}>{t("community.share_modal.privacy_note")}</Text>
        </>
      }
    >
      <TextInput
        style={styles.captionInput}
        value={caption}
        onChangeText={setCaption}
        placeholder={t("community.share_modal.caption_placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        maxLength={400}
        multiline
        accessibilityLabel={t("community.share_modal.caption_label")}
      />

      <Text style={styles.groupLabel}>
        {t("community.share_modal.photos_label", { count: photos.length, max: MAX_PHOTOS })}
      </Text>
      <View style={styles.photoRow}>
        {photos.map((uri, i) => (
          <View key={`${uri}-${i}`} style={styles.photoTile}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("community.share_modal.remove_photo_a11y")}
              hitSlop={6}
              onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              style={styles.photoRemove}
            >
              <Ionicons name="close" size={14} color={theme.colors.onPrimary} />
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void addPhotos()}
            style={({ pressed }) => [styles.photoTile, styles.photoAdd, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="images-outline" size={22} color={theme.colors.text} />
            <Text style={styles.photoAddText}>{t("community.share_modal.add_photo")}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.groupLabel}>{t("community.share_modal.choose_label")}</Text>
      {outfits === null && !loadError ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 12 }} />
      ) : loadError ? (
        <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.noteRow}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
          <Text style={styles.noteText}>
            {loadError} {t("common.retry")}
          </Text>
        </Pressable>
      ) : !outfits?.length ? (
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
          <Text style={styles.noteText}>{t("community.share_modal.no_outfits")}</Text>
        </View>
      ) : (
        outfits.map((o) => {
          const active = o.id === selectedId;
          const thumbs = o.clothing_ids
            .map((id) => refs.get(id))
            .filter((r): r is string => Boolean(r))
            .slice(0, 3);
          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSelectedId(active ? null : o.id)}
              style={[styles.outfitRow, active && styles.outfitRowActive]}
            >
              <View style={styles.thumbs}>
                {thumbs.length ? (
                  thumbs.map((r, i) => <SmartImage key={`${o.id}-thumb-${i}`} source={r} style={styles.thumb} />)
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="shirt-outline" size={16} color={theme.colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={styles.outfitBody}>
                <Text style={styles.outfitName} numberOfLines={1}>
                  {o.name || t("home.looks.untitled")}
                </Text>
                <Text style={styles.outfitMeta}>
                  {t("community.share_modal.pieces", { count: o.clothing_ids.length })}
                  {o.occasion ? `, ${o.occasion}` : ""}
                </Text>
              </View>
              <Ionicons
                name={active ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={active ? theme.colors.primary : theme.colors.border}
              />
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  groupLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    marginTop: 4,
  },
  outfitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  outfitRowActive: { borderColor: theme.colors.primary, borderWidth: 1.5 },
  thumbs: { flexDirection: "row", gap: 4 },
  thumb: {
    width: 38,
    height: 50,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primaryMuted,
    overflow: "hidden",
  },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  outfitBody: { flex: 1, minWidth: 0 },
  outfitName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  outfitMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  captionInput: {
    minHeight: 96,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    padding: 12,
    textAlignVertical: "top",
  },
  errorText: { fontSize: 12.5, color: theme.colors.danger },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: {
    width: 76,
    height: 96,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
  },
  photoAdd: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  photoAddText: { fontSize: 11.5, fontWeight: "600", color: theme.colors.text },
  photoRemove: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
  privacyNote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 15,
  },
}));