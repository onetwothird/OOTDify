// C:\OOTDify\src\features\tryon\TryOnEmptyState.tsx
// Shown on Try-on before the first result. Penggi stands on the edge of a
// dashed card (the app's "unfilled hang tag" outline) and the card lists the
// three steps in order, joined by a line, because the order is the point.
// The steps describe the real controls above; nothing here is placeholder data.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { Mascot } from "../../shared/components/Mascot";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";

const MASCOT = 112;
const MARK = 38;

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: "scan.jobs.empty.step1" | "scan.jobs.empty.step2" | "scan.jobs.empty.step3";
  hint: "scan.jobs.empty.step1.hint" | "scan.jobs.empty.step2.hint" | "scan.jobs.empty.step3.hint";
};

const STEPS: Step[] = [
  { icon: "body-outline", title: "scan.jobs.empty.step1", hint: "scan.jobs.empty.step1.hint" },
  { icon: "shirt-outline", title: "scan.jobs.empty.step2", hint: "scan.jobs.empty.step2.hint" },
  { icon: "sparkles-outline", title: "scan.jobs.empty.step3", hint: "scan.jobs.empty.step3.hint" },
];

export function TryOnEmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  /** Shown when the closet is empty, so the first step is one tap away. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  return (
    <View testID="empty-state">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.mascot} accessibilityElementsHidden importantForAccessibility="no">
          <Mascot size={MASCOT} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.rail}>
                <View style={styles.mark}>
                  <Ionicons name={step.icon} size={19} color={theme.colors.brand} />
                </View>
                {i < STEPS.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{t(step.title)}</Text>
                <Text style={styles.stepHint}>{t(step.hint)}</Text>
              </View>
            </View>
          ))}
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="camera-outline" size={18} color={theme.colors.background} />
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // Tall enough for Penggi to stand on the card's top edge, on the right.
  header: { height: MASCOT, justifyContent: "flex-end", paddingRight: MASCOT + 8, paddingBottom: 14 },
  mascot: { position: "absolute", right: 10, bottom: -6 },
  title: { ...theme.typography.heading, color: theme.colors.text },
  card: {
    padding: 18,
    paddingTop: 20,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 16,
  },
  message: { ...theme.typography.body, color: theme.colors.textMuted },
  steps: { gap: 0 },
  step: { flexDirection: "row", gap: 14 },
  rail: { width: MARK, alignItems: "center" },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  line: { flex: 1, width: 2, minHeight: 14, backgroundColor: theme.colors.border, marginVertical: 3 },
  stepText: { flex: 1, paddingBottom: 14, justifyContent: "flex-start", paddingTop: 2 },
  stepTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  stepHint: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted, marginTop: 2 },
  button: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.brand,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: theme.colors.background },
}));
