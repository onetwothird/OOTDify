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
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  applyBackup,
  buildBackup,
  collectStoredEntries,
  parseBackup,
  serializeBackup,
} from "../../features/settings/backup";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { toast } from "../../shared/lib/toast";

type IconName = keyof typeof Ionicons.glyphMap;

const INCLUDED: { icon: IconName; key: TranslationKey }[] = [
  { icon: "options-outline", key: "settings.backup_screen.included.settings" },
  { icon: "camera-outline", key: "settings.backup_screen.included.consent" },
  { icon: "person-circle-outline", key: "settings.backup_screen.included.avatar" },
];

const EXCLUDED: { icon: IconName; key: TranslationKey }[] = [
  { icon: "shirt-outline", key: "settings.backup_screen.excluded.wardrobe" },
  { icon: "sparkles-outline", key: "settings.backup_screen.excluded.looks" },
  { icon: "cloud-outline", key: "settings.backup_screen.excluded.account" },
];

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

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
          t("settings.backup_screen.error.sharing_unavailable.title"),
          t("settings.backup_screen.error.sharing_unavailable.message"),
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
        t("settings.backup_screen.success.exported.title"),
        t("settings.backup_screen.success.exported.message", { count: Object.keys(entries).length }),
      );
    } catch (e) {
      toast.error(
        t("settings.backup_screen.error.export_failed.title"),
        e instanceof Error ? e.message : t("settings.backup_screen.error.export_failed.message_default"),
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
        t("settings.backup_screen.success.restored.title"),
        t("settings.backup_screen.success.restored.message", { count }),
      );
    } catch (e) {
      toast.error(
        t("settings.backup_screen.error.restore_failed.title"),
        e instanceof Error ? e.message : t("settings.backup_screen.error.restore_failed.message_default"),
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
        <Text style={styles.navTitle}>{t("settings.backup_screen.title")}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          {t("settings.backup_screen.intro")}
        </Text>

        {/* ---------------------------------------------------------- Export */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>{t("settings.backup_screen.export.title")}</Text>
          </View>
          <Text style={styles.cardHint}>
            {t("settings.backup_screen.export.hint")}
          </Text>
          <AppActionRow
            label={t("settings.backup_screen.export.action")}
            icon="download-outline"
            loading={exporting}
            onPress={() => void runExport()}
          />
          {lastExportAt ? (
            <Text style={styles.metaLine}>
              {t("settings.backup_screen.export.last", { date: new Date(lastExportAt).toLocaleString() })}
            </Text>
          ) : null}
        </View>

        {/* ---------------------------------------------------------- Restore */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cloud-download-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>{t("settings.backup_screen.restore.title")}</Text>
          </View>
          <Text style={styles.cardHint}>
            {t("settings.backup_screen.restore.hint")}
          </Text>
          <AppActionRow
            label={t("settings.backup_screen.restore.action")}
            icon="folder-open-outline"
            loading={restoring}
            onPress={() => void runRestore()}
          />
        </View>

        {/* -------------------------------------------------------- What's in it */}
        <Text style={styles.sectionLabel}>{t("settings.backup_screen.included.label")}</Text>
        <View style={styles.card}>
          {INCLUDED.map((row) => (
            <View key={row.key} style={styles.scopeRow}>
              <Ionicons name={row.icon} size={17} color={theme.colors.success} />
              <Text style={styles.scopeText}>{t(row.key)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t("settings.backup_screen.excluded.label")}</Text>
        <View style={styles.card}>
          {EXCLUDED.map((row) => (
            <View key={row.key} style={styles.scopeRow}>
              <Ionicons name={row.icon} size={17} color={theme.colors.textMuted} />
              <Text style={[styles.scopeText, { color: theme.colors.textMuted }]}>
                {t(row.key)}
              </Text>
            </View>
          ))}
          <Text style={styles.cardHint}>
            {t("settings.backup_screen.excluded.note")}
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
  const styles = useStyles();
  const theme = useAppTheme();
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

const useStyles = makeStyles((theme: Theme) => ({
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
    borderWidth: 0.5,
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
}));
