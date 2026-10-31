// C:\OOTDify\src\features\tryon\TryOnMaintenance.tsx
// Shown in place of the try-on screen while TRYON_UNDER_MAINTENANCE is on:
// says plainly what's coming and offers what works today.
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../shared/components/AppButton";
import { useT } from "../../shared/i18n/useT";
import { useTabBarSpace } from "../../shared/navigation/useTabChrome";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useCaptureModalStore } from "../capture/captureModalStore";

export function TryOnMaintenance() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const { t } = useT();
  const openCapture = useCaptureModalStore((s) => s.open);

  const steps = [t("tryon.maintenance.step1"), t("tryon.maintenance.step2"), t("tryon.maintenance.step3")];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: tabBarSpace }]}
    >
      <Image
        source={require("../../../assets/images/headers/under-maintenance-penggi.png")}
        style={styles.penggi}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{t("tryon.maintenance.badge")}</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t("tryon.maintenance.title")}
      </Text>
      <Text style={styles.body}>{t("tryon.maintenance.body")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("tryon.maintenance.coming")}</Text>
        {steps.map((step, i) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <AppButton label={t("tryon.maintenance.add_piece")} icon="camera-outline" onPress={openCapture} />
        <AppButton
          label={t("tryon.maintenance.build_outfit")}
          icon="layers-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits" } })}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, alignItems: "center" },
  penggi: { width: 230, height: 230 },
  badge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: theme.colors.accent, letterSpacing: 0.4 },
  title: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    color: theme.colors.text,
  },
  body: { marginTop: 8, fontSize: 15, lineHeight: 22, textAlign: "center", color: theme.colors.textMuted },
  card: {
    alignSelf: "stretch",
    marginTop: 24,
    padding: 16,
    gap: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  stepNumText: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, color: theme.colors.text },
  actions: { alignSelf: "stretch", marginTop: 24, gap: 10 },
}));
