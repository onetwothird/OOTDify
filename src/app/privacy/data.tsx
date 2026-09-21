// C:\OOTDify\src\app\privacy\data.tsx
// Privacy & Data dashboard: per-category store counts, body-photo management
// shortcut, real "Download My Data" export (fetched from the server) and real
// account deletion (performed server-side, with explicit confirmation).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../shared/components/Button";
import { ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { theme } from "../../shared/config/theme";
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

  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState<{ filename: string; json: string } | null>(null);

  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getPrivacySummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your data summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        "Export failed",
        e instanceof Error ? e.message : "Could not export your data.",
      );
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete your account?",
      "This permanently removes, from the server: your profile, body photos and their analyses, wardrobe items, try-on jobs and generated images, saved outfits, favorites and viewing history.\n\nThere is no undo.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue…", style: "destructive", onPress: finalDelete },
      ],
    );
  };

  const finalDelete = () => {
    Alert.alert(
      "Final confirmation",
      "We can't restore anything after this. Delete your account and all data?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                await deleteAccount();
              } catch (e) {
                Alert.alert(
                  "Deletion failed",
                  e instanceof Error ? e.message : "Please try again later.",
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
    ? [
        { label: "Body photos", value: summary.bodyPhotos, icon: "body-outline" as const },
        { label: "Wardrobe items", value: summary.wardrobeItems, icon: "shirt-outline" as const },
        { label: "Try-on jobs", value: summary.tryOnJobs, icon: "sparkles-outline" as const },
        { label: "Saved outfits", value: summary.savedOutfits, icon: "layers-outline" as const },
        { label: "Favorites", value: summary.favorites, icon: "heart-outline" as const },
        { label: "Recently viewed", value: summary.recentlyViewed, icon: "time-outline" as const },
      ]
    : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Privacy & Data</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <LoadingState label="Loading your data summary" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : summary ? (
          <>
            <Text style={styles.intro}>
              Everything below is yours. We store the minimum needed to run the
              app, and every photo or generated image lives in a private bucket
              only you can access.
            </Text>

            <Text style={styles.sectionLabel}>WHAT WE STORE</Text>
            <View style={styles.card}>
              {rows.map((r) => (
                <View key={r.label} style={styles.statRow}>
                  <Ionicons name={r.icon} size={18} color={theme.colors.primary} />
                  <Text style={styles.statLabel}>{r.label}</Text>
                  <Text style={styles.statValue}>{r.value}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>YOUR CONTROLS</Text>
            <View style={styles.card}>
              <Row
                icon="scan-outline"
                label="Manage body photos"
                hint="View or delete scans stored on your account"
                onPress={() => router.push("/(tabs)/scan")}
              />
              <Row
                icon="download-outline"
                label="Download My Data"
                hint="Export a copy of everything we hold about you"
                onPress={downloadData}
                busy={exporting}
              />
            </View>

            <Text style={styles.sectionLabel}>DANGER ZONE</Text>
            <View style={[styles.card, styles.dangerCard]}>
              <Text style={styles.dangerText}>
                Deleting your account removes all of the data listed above from
                our servers and cannot be undone.
              </Text>
              <Button
                title={deleting ? "Deleting…" : "Delete account"}
                loading={deleting}
                onPress={confirmDelete}
                style={styles.dangerBtn}
              />
            </View>

            <Text style={styles.footnote}>
              This is a partial, honest snapshot. The Delete Account action is
              performed server-side and also removes your sign-in credentials.
            </Text>
          </>
        ) : null}
      </ScrollView>

      {exportPreview ? (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setExportPreview(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Your data export</Text>
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
              <Text style={styles.modalCloseText}>Done</Text>
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  intro: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.text },
  statValue: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  rowHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  dangerCard: { gap: 10 },
  dangerText: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  dangerBtn: { backgroundColor: "#B45309" },
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
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 18,
    gap: 10,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
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
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCloseText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
});