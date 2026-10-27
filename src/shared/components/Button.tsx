// src/shared/components/Button.tsx
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
}

export function Button({ title, loading, style, ...props }: ButtonProps) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      style={[styles.button, props.disabled && styles.disabled, style]}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onBrand} />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((theme) => ({
  button: {
    backgroundColor: theme.colors.brand,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: theme.colors.onBrand,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
}));