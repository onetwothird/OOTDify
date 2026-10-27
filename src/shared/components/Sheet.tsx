// C:\OOTDify\src\shared\components\Sheet.tsx
// The one bottom-sheet shell every modal uses: a dimmed backdrop that fades in,
// a panel that rises from the bottom, a header carrying the same hang tag as
// ScreenHeader (section icon on a punched tag), and an optional pinned footer
// for the sheet's actions so the primary button never scrolls out of reach.
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { useT } from "../i18n/useT";
import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Icon on the header's hang tag. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** While true the sheet can't be dismissed (an upload or save is running). */
  busy?: boolean;
  /** Pinned under the body, above the home indicator: the sheet's actions. */
  footer?: ReactNode;
  /**
   * true (default): children scroll inside the sheet's padded body.
   * false: children lay themselves out (they own any list/scroll), still padded.
   */
  scroll?: boolean;
  children: ReactNode;
}

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  busy = false,
  footer,
  scroll = true,
  children,
}: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const reduceMotion = useReduceMotion();
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      rise.setValue(0);
      return;
    }
    if (reduceMotion) {
      rise.setValue(1);
      return;
    }
    const anim = Animated.timing(rise, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, rise, reduceMotion]);

  const close = () => {
    if (!busy) onClose();
  };
  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: footer ? 0 : bottomPad,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            {icon ? (
              <View style={styles.tag} accessibilityElementsHidden importantForAccessibility="no">
                <View style={styles.tagHole} />
                <Ionicons name={icon} size={17} color={theme.colors.onPrimary} />
              </View>
            ) : null}
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              hitSlop={8}
              disabled={busy}
              onPress={close}
              style={({ pressed }) => [styles.closeBtn, (pressed || busy) && { opacity: 0.5 }]}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          {scroll ? (
            <ScrollView
              style={styles.flexBody}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.flexBody, styles.body]}>{children}</View>
          )}

          {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, justifyContent: "flex-end" },
  // A dimming scrim is the one place a translucent fill is the point.
  backdrop: { backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "90%",
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  flexBody: { flexShrink: 1 },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    backgroundColor: theme.colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tag: {
    width: 34,
    height: 40,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 7,
    transform: [{ rotate: "-4deg" }],
  },
  tagHole: {
    position: "absolute",
    top: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surface,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, lineHeight: 24, fontWeight: "800", letterSpacing: -0.3, color: theme.colors.text },
  subtitle: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 12 },
  footer: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
}));
