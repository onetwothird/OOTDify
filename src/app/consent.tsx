// C:\OOTDify\src\app\consent.tsx
// Post-auth consent gate (Phase 7): shown when the signed-in account has no
// recorded acceptance of the current Terms/Privacy version (including every
// account created before Phase 7 shipped). The backend independently enforces
// the same requirement on AI-processing endpoints (403 consent_required), so
// this screen is the honest way through, not a formality.
//
// Accept writes terms_version + a UTC acceptance timestamp into the user's
// auth metadata (supabase.auth.updateUser), which the layout's gate then
// reads to let the user through. Decline signs out — nothing is recorded.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "../shared/components/AppButton";
import {
  PRIVACY_ROUTE,
  TERMS_DISPLAY_DATE,
  TERMS_ROUTE,
  TERMS_VERSION,
} from "../shared/config/legal";
import { useAppTheme } from "../shared/theme/ThemeProvider";
import { makeStyles } from "../shared/theme/makeStyles";
import type { Theme } from "../shared/config/theme";
import { useT } from "../shared/i18n/useT";
import { supabase } from "../shared/lib/supabase";

export default function ConsentScreen() {
  const theme = useAppTheme();
  const styles = useStyles();
  const { t } = useT();
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleAccept = async () => {
    if (!checked || accepting) return;
    setAccepting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      // The root layout's gate re-reads session metadata on the auth event
      // and lets the user through; navigating here keeps it explicit.
      router.replace("/(tabs)/home");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("consent.accept_error.default");
      Alert.alert(t("consent.accept_error.title"), message);
    } finally {
      setAccepting(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)");
    } catch {
      Alert.alert(t("consent.signout_error.title"), t("auth.common.try_again"));
    } finally {
      setSigningOut(false);
    }
  };

  const openTerms = () => router.push(TERMS_ROUTE);
  const openPrivacy = () => router.push(PRIVACY_ROUTE);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconTile}>
          <Ionicons name="document-text-outline" size={28} color={theme.colors.text} />
        </View>

        <Text style={styles.title}>{t("consent.title")}</Text>
        <Text style={styles.subtitle}>
          {t("consent.subtitle", { version: TERMS_VERSION, date: TERMS_DISPLAY_DATE })}
        </Text>

        <View style={styles.docList}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("consent.terms.a11y")}
            onPress={openTerms}
            style={({ pressed }) => [styles.docRow, pressed && styles.docRowPressed]}
          >
            <Ionicons name="reader-outline" size={20} color={theme.colors.text} />
            <Text style={styles.docRowText}>{t("consent.terms.label")}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("consent.privacy.a11y")}
            onPress={openPrivacy}
            style={({ pressed }) => [styles.docRow, pressed && styles.docRowPressed]}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.text} />
            <Text style={styles.docRowText}>{t("consent.privacy.label")}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={t("consent.checkbox.a11y")}
          onPress={() => setChecked((v) => !v)}
          style={styles.checkRow}
        >
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={22}
            color={checked ? theme.colors.brand : theme.colors.textMuted}
          />
          <Text style={styles.checkText}>
            {t("consent.checkbox.label")}
          </Text>
        </Pressable>

        <AppButton
          label={t("consent.accept")}
          icon="checkmark"
          onPress={handleAccept}
          disabled={!checked}
          loading={accepting}
          style={styles.acceptButton}
        />
        <AppButton
          label={signingOut ? t("consent.accept.loading") : t("consent.decline")}
          variant="ghost"
          onPress={handleSignOut}
          loading={signingOut}
        />

        <Text style={styles.footnote}>
          {t("consent.footnote")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.spacing.page,
    paddingTop: theme.spacing.xl,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },
  docList: {
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    overflow: "hidden",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
  },
  docRowPressed: { backgroundColor: theme.colors.surfaceAlt },
  docRowText: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.colors.text },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  checkText: { flex: 1, fontSize: 14, lineHeight: 20, color: theme.colors.text },
  acceptButton: { marginBottom: theme.spacing.sm },
  footnote: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
}));
