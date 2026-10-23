// C:\OOTDify\src\app\settings\backup.tsx
// Backup — export every device-local entry OOTDify keeps in AsyncStorage to a
// JSON file (shared through the system share sheet), or restore one back.
//
// SCOPE (stated honestly on screen): this covers DEVICE data only — settings,
// camera consent, pending avatar info. Account data (wardrobe, outfits, body
// photos) lives in Supabase under Privacy & Data, not in this file.
//
// Export writes to the app cache dir via expo-file-system's File API and hands
// off to expo-sharing; restore reads a JSON the user picks via
// expo-document-picker and validates it with the shared parseBackup() before
// touching storage.
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Paths, File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  applyBackup,
  buildBackup,
  collectStoredEntries,
  parseBackup,
  serializeBackup,
} from "../../features/settings/backup";
import { theme } from "../../shared/config/theme";
import { toast } from "../../shared/lib/toast";

type IconName = keyof typeof Ionicons.glyphMap;

const INCLUDED: { icon: IconName; text: string }[] = [
  { icon: "options-outline", text: "Settings — language, appearance, biometric unlock" },
  { icon: "camera-outline", text: "Camera permission consent" },
  { icon: "person-circle-outline", text: "Pending avatar change info" },
];

const EXCLUDED: { icon: IconName; text: string }[] = [
  { icon: "shirt-outline", text: "Wardrobe items and photos" },
  { icon: "sparkles-outline", text: "Saved looks and try-ons" },
  { icon: "cloud-outline", text: "Anything tied to your account" },
];

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);

  const runExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const entries = await collectStoredEntries();
      const file = new File(
        Paths.cache,
        `ootdify-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      file.write(serializeBackup(buildBackup(entries)));

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        toast.error(
          "Sharing unavailable",
          "This device can't open the share sheet, so the file was kept in app storage only. Try again on a device with sharing support.",
        );
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Save your OOTDify backup",
        UTI: "public.json",
      });
      setLastExportAt(new Date().toISOString());
      toast.success(
        "Backup exported",
        `${Object.keys(entries).length} entries saved — choose where to keep the file.`,
      );
    } catch (e) {
      toast.error(
        "Export failed",
        e instanceof Error ? e.message : "Could not write the backup file.",
      );
    } finally {
      setExporting(false);
    }
  };

  const runRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (pick.canceled || !pick.assets?.length) return;

      const text = await new File(pick.assets[0].uri).text();
      const backup = parseBackup(text); // throws with a readable message
      const count = await applyBackup(backup);
      toast.success(
        "Backup restored",
        `${count} entries written. Restart OOTDify so saved preferences reload.`,
      );
    } catch (e) {
      toast.error(
        "Restore failed",
        e instanceof Error ? e.message : "Could not restore that file.",
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.navBtn}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Backup</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Export the data OOTDify keeps on this device to a file you control,
          or restore that file later on this or another device.
        </Text>

        {/* ---------------------------------------------------------- Export */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Export backup</Text>
          </View>
          <Text style={styles.cardHint}>
            Writes a JSON file and opens the share sheet so you can save it to
            Files, Drive, or anywhere you like.
          </Text>
          <AppActionRow
            label="Export to a file"
            icon="download-outline"
            loading={exporting}
            onPress={() => void runExport()}
          />
          {lastExportAt ? (
            <Text style={styles.metaLine}>
              Last export: {new Date(lastExportAt).toLocaleString()}
            </Text>
          ) : null}
        </View>

        {/* ---------------------------------------------------------- Restore */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cloud-download-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Restore backup</Text>
          </View>
          <Text style={styles.cardHint}>
            Pick a previously exported OOTDify backup. It&apos;s validated first —
            a wrong or newer file is rejected instead of half-applied.
          </Text>
          <AppActionRow
            label="Choose a backup file"
            icon="folder-open-outline"
            loading={restoring}
            onPress={() => void runRestore()}
          />
        </View>

        {/* -------------------------------------------------------- What's in it */}
        <Text style={styles.sectionLabel}>WHAT&apos;S INCLUDED</Text>
        <View style={styles.card}>
          {INCLUDED.map((row) => (
            <View key={row.text} style={styles.scopeRow}>
              <Ionicons name={row.icon} size={17} color={theme.colors.success} />
              <Text style={styles.scopeText}>{row.text}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>WHAT&apos;S NOT — IT LIVES IN YOUR ACCOUNT</Text>
        <View style={styles.card}>
          {EXCLUDED.map((row) => (
            <View key={row.text} style={styles.scopeRow}>
              <Ionicons name={row.icon} size={17} color={theme.colors.textMuted} />
              <Text style={[styles.scopeText, { color: theme.colors.textMuted }]}>
                {row.text}
              </Text>
            </View>
          ))}
          <Text style={styles.cardHint}>
            Account data is stored in the cloud under your sign-in. Use
            Privacy &amp; Data in Profile to manage or delete it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function AppActionRow({
  label,
  icon,
  loading,
  onPress,
}: {
  label: string;
  icon: IconName;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && !loading && { opacity: 0.85 }, loading && { opacity: 0.6 }]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.onPrimary} />
      ) : (
        <Ionicons name={icon} size={17} color={theme.colors.onPrimary} />
      )}
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  intro: { fontSize: 13.5, lineHeight: 20, color: theme.colors.textMuted },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14.5, fontWeight: "800", color: theme.colors.text },
  cardHint: { fontSize: 12.5, lineHeight: 18, color: theme.colors.textMuted },
  metaLine: { fontSize: 11.5, color: theme.colors.textMuted },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  scopeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  scopeText: { flex: 1, fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  actionLabel: { fontSize: 13.5, fontWeight: "800", color: theme.colors.onPrimary },
});
