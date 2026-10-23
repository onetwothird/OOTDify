// C:\OOTDify\src\shared\components\FormField.tsx
// Labeled text field used by the auth screens: leading icon, focus ring, and an
// automatic show/hide toggle for secure fields. Keeps login / signup / password
// reset visually identical without duplicating input styling three times.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface Props extends Omit<TextInputProps, "style"> {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Renders a secure field with a show/hide eye toggle. */
  secure?: boolean;
}

export function FormField({ label, icon, secure = false, ...inputProps }: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const iconColor = focused ? theme.colors.text : theme.colors.textMuted;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Ionicons name={icon} size={19} color={iconColor} style={styles.leadingIcon} />
        <TextInput
          {...inputProps}
          style={styles.input}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={secure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={8}
            onPress={() => setRevealed((value) => !value)}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={19}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: { marginBottom: theme.spacing.md },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 6,
    marginLeft: 2,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    // Inset fill: reads as an input on the white auth card.
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fieldFocused: { borderColor: theme.colors.text },
  leadingIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.text,
    paddingVertical: 0,
  },
}));