// C:\OOTDify\src\app\(auth)\index.tsx
// Get Started / landing screen: brand mark, honest feature highlights and the
// two entry points. No placeholder imagery and no fake carousel — the mark is a
// local asset and every line below describes a feature that actually exists.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.top}>
          <View style={styles.brandRow}>
            <Image
              source={require("../../../assets/images/ootdify-icon.png")}
              style={styles.brandMark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.brandName}>OOTDify</Text>
          </View>

          <View style={styles.hero}>
            <Text style={styles.kicker}>WARDROBE · AI STYLING</Text>
            <Text style={styles.display}>
              Dress well,{"\n"}effortlessly.
            </Text>
            <Text style={styles.lede}>
              Understand your body with AI, organise every piece you own, and
              plan real outfits for the days ahead.
            </Text>
          </View>
        </View>

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
              style={styles.legalLink}
              onPress={() => router.push(TERMS_ROUTE)}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              accessibilityRole="link"
              style={styles.legalLink}
              onPress={() => router.push(PRIVACY_ROUTE)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    justifyContent: "space-between",
  },
  top: { gap: theme.spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 34, height: 34 },
  brandName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: theme.colors.text,
  },
  hero: { gap: 12 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    color: theme.colors.textMuted,
  },
  display: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: theme.colors.text,
  },
  lede: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    color: theme.colors.textMuted,
    maxWidth: 340,
  },
  featureCard: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
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
  actions: { gap: 12 },
  pill: { borderRadius: theme.borderRadius.pill },
  legal: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.textMuted,
    paddingHorizontal: theme.spacing.sm,
  },
  legalLink: { color: theme.colors.text, fontWeight: "700" },
});
