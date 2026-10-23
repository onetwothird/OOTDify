// C:\OOTDify\src\shared\components\OAuthButtons.tsx
// Google + Facebook sign-in buttons, shared by the login and signup screens.
// Each button reflects its own loading state; while either flow is running both
// are disabled so a user can't start two OAuth sessions at once.
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface SocialButtonProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}

function SocialButton({ label, icon, onPress, loading, disabled }: SocialButtonProps) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      accessibilityState={{ disabled, busy: loading }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && !loading && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.text} />
      ) : (
        <>
          <Ionicons name={icon} size={19} color={theme.colors.text} />
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

interface Props {
  onGoogle: () => void;
  onFacebook: () => void;
  googleLoading?: boolean;
  facebookLoading?: boolean;
  disabled?: boolean;
}

export function OAuthButtons({
  onGoogle,
  onFacebook,
  googleLoading = false,
  facebookLoading = false,
  disabled = false,
}: Props) {
  const styles = useStyles();
  const anyLoading = googleLoading || facebookLoading;
  return (
    <View style={styles.row}>
      <SocialButton
        label="Google"
        icon="logo-google"
        onPress={onGoogle}
        loading={googleLoading}
        disabled={disabled || anyLoading}
      />
      <SocialButton
        label="Facebook"
        icon="logo-facebook"
        onPress={onFacebook}
        loading={facebookLoading}
        disabled={disabled || anyLoading}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: "row", gap: theme.spacing.sm + 4 },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  label: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
}));