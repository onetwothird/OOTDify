// C:\OOTDify\src\app\settings\help.tsx
// How to use OOTDify — a short, real walkthrough of the app's core flows.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../shared/config/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shirt-outline",
    title: "Build your wardrobe",
    body: "Add clothes from your camera or photo library. Each piece is stored privately in your account and organised by category.",
  },
  {
    icon: "sparkles-outline",
    title: "Generate a look",
    body: "Pick an occasion and let the AI compose a complete outfit from your own wardrobe and the shared catalog.",
  },
  {
    icon: "cube-outline",
    title: "Try it on",
    body: "Upload a body photo once, then see how a look sits on you before you wear it.",
  },
  {
    icon: "calendar-outline",
    title: "Plan your week",
    body: "Open the Outfits calendar to schedule looks ahead of time and never repeat an outfit by accident.",
  },
  {
    icon: "heart-outline",
    title: "Save favourites",
    body: "Tap the heart on any item or look. Saved pieces surface again in your recommendations.",
  },
];

const TIPS: string[] = [
  "Fill out your style preferences in Profile — recommendations get sharper with every answer.",
  "Tag every wardrobe piece with its category so the generator never mixes up tops and shoes.",
  "Your body photo is private to your account and only used for try-on.",
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
        <Text style={styles.navTitle}>How to use OOTDify</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          OOTDify helps you get dressed with what you already own. Follow these
          steps to get the most out of it.
        </Text>

        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.stepCard}>
            <View style={styles.stepIndex}>
              <Text style={styles.stepIndexText}>{i + 1}</Text>
            </View>
            <View style={styles.stepBody}>
              <View style={styles.stepTitleRow}>
                <Ionicons name={step.icon} size={18} color={theme.colors.primary} />
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>
              <Text style={styles.stepText}>{step.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionLabel}>TIPS</Text>
        <View style={styles.card}>
          {TIPS.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={18} color={theme.colors.warning} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
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
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  intro: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  stepCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
  },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: { color: theme.colors.onPrimary, fontWeight: "800", fontSize: 13 },
  stepBody: { flex: 1, minWidth: 0, gap: 4 },
  stepTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepTitle: { fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  stepText: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  tipRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
});
