// src/shared/components/GlassCard.tsx
import { StyleSheet, View, ViewProps } from "react-native";

import { makeStyles } from "../theme/makeStyles";

export function GlassCard({ style, children, ...props }: ViewProps) {
  const styles = useStyles();
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    overflow: "hidden",
  },
}));