// C:\OOTDify\src\features\community\components\ShareOutfitModal.tsx
// "Share a look" — pick one of your saved outfits, add a caption, post it to
// the community feed. The service copies any private images into the public
// community bucket; nothing in your private wardrobe becomes readable.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchSavedOutfits, SavedOutfit } from "../../clothing/service";
import { AppButton } from "../../../shared/components/AppButton";
import { EmptyState, ErrorState } from "../../../shared/components/StateViews";
import { SmartImage } from "../../../shared/components/SmartImage";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
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

export function ShareOutfitModal({
  visible,
  onClose,
  onShared,
}: {
  visible: boolean;
  onClose: () => void;
  onShared: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const theme = useAppTheme();
  const [outfits, setOutfits] = useState<SavedOutfit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Map<string, string | null>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);

  const handleClose = () => {
    setSelectedId(null);
    setCaption("");
    onClose();
  };

  const load = useCallback(async () => {
    try {
      const rows = await fetchSavedOutfits();
      setOutfits(rows);
      setError(null);
      setRefs(await previewRefs(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your saved looks.");
    }
  }, []);

  // Load outfits when modal becomes visible — inline async in effect to avoid setState-in-effect lint error.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchSavedOutfits();
        if (cancelled) return;
        setOutfits(rows);
        setError(null);
        setRefs(await previewRefs(rows));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load your saved looks.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const selected = outfits?.find((o) => o.id === selectedId) ?? null;

  const share = async () => {
    if (!selected || sharing) return;
    setSharing(true);
    try {
      await shareOutfit({
        outfitId: selected.id,
        title: selected.name,
        caption,
        clothingIds: selected.clothing_ids,
      });
      setSelectedId(null);
      setCaption("");
      onShared();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not share this look.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Share a look</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={handleClose}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              {outfits === null && !error ? (
                <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
              ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
              ) : !outfits?.length ? (
                <EmptyState
                  icon="sparkles-outline"
                  title="No saved looks yet"
                  message="Save an outfit from the Outfits tab, then share it here."
                  compact
                />
              ) : (
                <>
                  <Text style={styles.groupLabel}>CHOOSE AN OUTFIT</Text>
                  {outfits.map((o) => {
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
                            thumbs.map((r, i) => (
                              <SmartImage
                                key={`${o.id}-thumb-${i}`}
                                source={r}
                                style={styles.thumb}
                              />
                            ))
                          ) : (
                            <View style={[styles.thumb, styles.thumbEmpty]}>
                              <Ionicons name="shirt-outline" size={16} color={theme.colors.textMuted} />
                            </View>
                          )}
                        </View>
                        <View style={styles.outfitBody}>
                          <Text style={styles.outfitName} numberOfLines={1}>
                            {o.name || "Untitled look"}
                          </Text>
                          <Text style={styles.outfitMeta}>
                            {o.clothing_ids.length} piece{o.clothing_ids.length === 1 ? "" : "s"}
                            {o.occasion ? ` · ${o.occasion}` : ""}
                          </Text>
                        </View>
                        <Ionicons
                          name={active ? "checkmark-circle" : "ellipse-outline"}
                          size={22}
                          color={active ? theme.colors.primary : theme.colors.border}
                        />
                      </Pressable>
                    );
                  })}

                  <Text style={styles.groupLabel}>CAPTION</Text>
                  <TextInput
                    style={styles.captionInput}
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Tell the community about this look…"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={400}
                    multiline
                  />

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <AppButton
                    label="Post to Community"
                    icon="cloud-upload-outline"
                    loading={sharing}
                    disabled={!selected}
                    onPress={() => void share()}
                  />
                  <Text style={styles.privacyNote}>
                    The outfit images are copied to the public Community bucket. Your wardrobe
                    itself stays private.
                  </Text>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetWrap: { flex: 1, justifyContent: "flex-end", width: "100%" },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: "86%",
  },
  handleWrap: { alignItems: "center", paddingTop: 8 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  groupLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 10,
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
  outfitName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  outfitMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  captionInput: {
    minHeight: 72,
    fontSize: 14,
    color: theme.colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    padding: 10,
    textAlignVertical: "top",
  },
  errorText: { fontSize: 12.5, color: theme.colors.danger },
  privacyNote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 15,
  },
}));