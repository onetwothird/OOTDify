// src/components/ui/GlassCard.tsx
import { StyleSheet, View, ViewProps } from "react-native";
import { theme } from "../../shared/config/theme";

export function GlassCard({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    overflow: "hidden",
  },
});
