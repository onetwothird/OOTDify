// C:\OOTDify\src\shared\components\AppButton.tsx
// Primary / secondary / ghost action button with loading + icon support.
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { theme } from "../config/theme";

export type AppButtonVariant = "primary" | "secondary" | "ghost";
export type AppButtonSize = "md" | "lg";

interface Props {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  loading = false,
  disabled = false,
  style,
}: Props) {
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const lg = size === "lg";
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        lg ? styles.lg : styles.md,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        variant === "ghost" && styles.ghost,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.colors.onPrimary : theme.colors.text} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={lg ? 19 : 17}
              color={isPrimary ? theme.colors.onPrimary : theme.colors.text}
            />
          ) : null}
          <Text
            style={[
              styles.label,
              lg ? styles.labelLg : styles.labelMd,
              isPrimary && { color: theme.colors.onPrimary },
              (isSecondary || variant === "ghost") && { color: theme.colors.text },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lg: { paddingVertical: 16, borderRadius: theme.borderRadius.md, minHeight: 54 },
  md: { paddingVertical: 12, borderRadius: theme.borderRadius.md, minHeight: 46 },
  primary: { backgroundColor: theme.colors.primary },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  label: { fontWeight: "700" },
  labelLg: { fontSize: 15 },
  labelMd: { fontSize: 14 },
});