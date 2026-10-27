import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../shared/components/Button";
import { ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { supabase } from "../../shared/lib/supabase";
import {
  deleteAccount,
  exportAccountData,
  getPrivacySummary,
  PrivacySummary,
} from "../../services/aiApi";

export default function PrivacyDataScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState<{ filename: string; json: string } | null>(null);

  const [deleting, setDeleting] = useState(false);

  // Core loader — effect-safe (no synchronous setState); state starts as loading.
  const fetchSummary = useCallback(async () => {
    try {
      const summary = await getPrivacySummary();
      setSummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("privacy.data.error.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Handler-facing wrapper: show the spinner and clear the previous error.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    // Kick off through a microtask: the loader only setState after its awaits,
    // and deferring keeps setState from running synchronously inside the effect
    // body (which is what causes cascading renders).
    Promise.resolve()
      .then(() => fetchSummary())
      .catch(() => {
        // fetchSummary handles its own errors; this guards the indirection.
      });
  }, [fetchSummary]);

  const downloadData = async () => {
    setExporting(true);
    try {
      const result = await exportAccountData();
      setExportPreview(result);
      try {
        await Share.share({
          title: result.filename,
          message: result.json,
        });
      } catch {
        // User dismissed the share sheet — the preview modal below still works.
      }
    } catch (e) {
      Alert.alert(
        t("privacy.data.export_error.title"),
        e instanceof Error ? e.message : t("privacy.data.export_error.message_default"),
      );
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t("privacy.data.delete_confirm.title"),
      t("privacy.data.delete_confirm.message"),
      [
        { text: t("privacy.data.delete_confirm.cancel"), style: "cancel" },
        { text: t("privacy.data.delete_confirm.continue"), style: "destructive", onPress: finalDelete },
      ],
    );
  };

  const finalDelete = () => {
    Alert.alert(
      t("privacy.data.final_confirm.title"),
      t("privacy.data.final_confirm.message"),
      [
        { text: t("privacy.data.final_confirm.cancel"), style: "cancel" },
        {
          text: t("privacy.data.final_confirm.delete_everything"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                await deleteAccount();
              } catch (e) {
                Alert.alert(
                  t("privacy.data.deletion_failed.title"),
                  e instanceof Error ? e.message : t("privacy.data.deletion_failed.message_default"),
                );
                setDeleting(false);
                return;
              }
              try {
                await supabase.auth.signOut();
              } catch {
                /* session is already invalid server-side */
              }
              router.replace("/(auth)");
            })();
          },
        },
      ],
    );
  };

  const rows = summary
    ? ([
        { labelKey: "privacy.data.stored.body_photos", value: summary.bodyPhotos, icon: "body-outline" as const },
        { labelKey: "privacy.data.stored.wardrobe_items", value: summary.wardrobeItems, icon: "shirt-outline" as const },
        { labelKey: "privacy.data.stored.tryon_jobs", value: summary.tryOnJobs, icon: "sparkles-outline" as const },
        { labelKey: "privacy.data.stored.saved_outfits", value: summary.savedOutfits, icon: "layers-outline" as const },
        { labelKey: "privacy.data.stored.favorites", value: summary.favorites, icon: "heart-outline" as const },
        { labelKey: "privacy.data.stored.recently_viewed", value: summary.recentlyViewed, icon: "time-outline" as const },
      ] satisfies { labelKey: TranslationKey; value: number; icon: keyof typeof Ionicons.glyphMap }[])
    : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t("profile.privacy.data")}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <LoadingState label={t("privacy.data.loading")} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : summary ? (
          <>
            <Text style={styles.intro}>
              {t("privacy.data.intro")}
            </Text>

            <Text style={styles.sectionLabel}>{t("privacy.data.stored.label")}</Text>
            <View style={styles.card}>
              {rows.map((r) => (
                <View key={r.labelKey} style={styles.statRow}>
                  <Ionicons name={r.icon} size={18} color={theme.colors.brand} />
                  <Text style={styles.statLabel}>{t(r.labelKey)}</Text>
                  <Text style={styles.statValue}>{r.value}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t("privacy.data.controls.label")}</Text>
            <View style={styles.card}>
              <Row
                icon="scan-outline"
                label={t("privacy.data.controls.manage_photos.label")}
                hint={t("privacy.data.controls.manage_photos.hint")}
                onPress={() => router.push("/(tabs)/scan")}
              />
              <Row
                icon="download-outline"
                label={t("privacy.data.controls.download.label")}
                hint={t("privacy.data.controls.download.hint")}
                onPress={downloadData}
                busy={exporting}
              />
            </View>

            <Text style={styles.sectionLabel}>{t("privacy.data.danger.label")}</Text>
            <View style={[styles.card, styles.dangerCard]}>
              <Text style={styles.dangerText}>
                {t("privacy.data.danger.text")}
              </Text>
              <Button
                title={deleting ? t("privacy.data.danger.deleting") : t("privacy.data.danger.delete")}
                loading={deleting}
                onPress={confirmDelete}
                style={styles.dangerBtn}
              />
            </View>

            <Text style={styles.footnote}>
              {t("privacy.data.footnote")}
            </Text>
          </>
        ) : null}
      </ScrollView>

      {exportPreview ? (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setExportPreview(null)}
        >
          <Pressable style={[styles.modalCard, { marginBottom: 12 }]} onPress={() => undefined}>
            <Text style={styles.modalTitle}>{t("privacy.data.modal.title")}</Text>
            <Text style={styles.modalSub}>{exportPreview.filename}</Text>
            <TextInput
              style={styles.exportText}
              multiline
              editable={false}
              value={exportPreview.json}
              textAlignVertical="top"
            />
            <Pressable
              accessibilityRole="button"
              style={styles.modalClose}
              onPress={() => setExportPreview(null)}
            >
              <Text style={styles.modalCloseText}>{t("privacy.data.modal.done")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({
  icon,
  label,
  hint,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.brand} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.brand} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  intro: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.text },
  statValue: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  rowHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  dangerCard: { gap: 10 },
  dangerText: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  dangerBtn: { backgroundColor: theme.colors.danger },
  footnote: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
    paddingBottom: 36,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 18,
    gap: 10,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  modalSub: { fontSize: 12, color: theme.colors.textMuted },
  exportText: {
    backgroundColor: theme.colors.primaryMuted,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: 11,
    color: theme.colors.text,
    maxHeight: 320,
  },
  modalClose: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCloseText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 14 },
}));
