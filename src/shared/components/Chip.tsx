// C:\OOTDify\src\shared\components\Chip.tsx
// Single selectable pill — used for occasions, categories, filters, toggles.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface Props {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Chip({ label, active = false, onPress, icon }: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={15}
          color={active ? theme.colors.onPrimary : theme.colors.textMuted}
        />
      ) : null}
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  textActive: { color: theme.colors.onPrimary, fontWeight: "700" },
}));
