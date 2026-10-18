// C:\OOTDify\src\app\(auth)\index.tsx
// Get Started / landing screen: brand lockup, honest feature highlights and the
// two entry points. No placeholder imagery and no fake carousel — every line
// below describes a feature that actually exists. The brand mark is drawn with
// an icon + wordmark (no bitmap).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../shared/components/AppButton";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "../../shared/config/legal";
import { theme } from "../../shared/config/theme";

const FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}[] = [
  {
    icon: "shirt-outline",
    title: "Your wardrobe, catalogued",
    body: "Add each piece once and find it instantly.",
  },
  {
    icon: "body-outline",
    title: "AI body analysis",
    body: "Pose and segmentation from your own scans.",
  },
  {
    icon: "calendar-outline",
    title: "Plan by date",
    body: "Save and schedule outfits on a real calendar.",
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          {/* Decorative washes — plain views (no gradients, no images). */}
          <View style={[styles.blob, styles.blobA]} pointerEvents="none" />
          <View style={[styles.blob, styles.blobB]} pointerEvents="none" />

          <View style={styles.brandRow}>
            <View style={styles.brandTile}>
              <Ionicons name="shirt-outline" size={16} color={theme.colors.onPrimary} />
            </View>
            <Text style={styles.brandName}>OOTDify</Text>
          </View>

          <Text style={styles.kicker}>WARDROBE · AI STYLING</Text>
          <Text style={styles.display}>
            Dress well,{"\n"}effortlessly.
          </Text>
          <Text style={styles.lede}>
            Understand your body with AI, organise every piece you own, and plan
            real outfits for the days ahead.
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.featureCard}>
            {FEATURES.map((feature, index) => (
              <View
                key={feature.title}
                style={[styles.featureRow, index > 0 && styles.featureDivider]}
              >
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon} size={20} color={theme.colors.text} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <AppButton
              label="Create an account"
              onPress={() => router.push("/signup")}
              style={styles.pill}
            />
            <AppButton
              label="Log in"
              variant="secondary"
              onPress={() => router.push("/login")}
              style={styles.pill}
            />
            <Text style={styles.legal}>
              By continuing you agree to our{" "}
              <Text
                accessibilityRole="link"
                suppressHighlighting={false}
                style={styles.legalLink}
                onPress={() => router.push(TERMS_ROUTE)}
              >
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text
                accessibilityRole="link"
                suppressHighlighting={false}
                style={styles.legalLink}
                onPress={() => router.push(PRIVACY_ROUTE)}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  hero: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 72,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  blobA: { width: 240, height: 240, top: -100, right: -80 },
  blobB: {
    width: 170,
    height: 170,
    bottom: -70,
    left: -60,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandTile: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  brandName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: theme.colors.onPrimary,
  },
  kicker: {
    marginTop: theme.spacing.xl,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    color: "rgba(255,255,255,0.62)",
  },
  display: {
    marginTop: 10,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: theme.colors.onPrimary,
  },
  lede: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    color: "rgba(255,255,255,0.72)",
    maxWidth: 320,
  },
  body: {
    flex: 1,
    marginTop: -42,
    paddingHorizontal: theme.spacing.md,
  },
  featureCard: {
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: 14,
  },
  featureDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  featureBody: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
  actions: { marginTop: "auto", paddingTop: theme.spacing.xl, gap: 12 },
  pill: { borderRadius: theme.borderRadius.pill },
  legal: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.textMuted,
    paddingHorizontal: theme.spacing.sm,
  },
  legalLink: {
    color: theme.colors.text,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
