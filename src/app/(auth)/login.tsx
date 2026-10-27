// C:\OOTDify\src\app\(auth)\login.tsx
// Login screen — email/password plus Google and Facebook sign-in.
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../shared/components/AppButton";
import { AuthCard, AuthHero } from "../../shared/components/AuthShell";
import { FormField } from "../../shared/components/FormField";
import { OAuthButtons } from "../../shared/components/OAuthButtons";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { signInWithFacebook, signInWithGoogle } from "../../shared/lib/oauth";
import { supabase } from "../../shared/lib/supabase";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  // One in-flight action at a time: taps during any auth attempt are no-ops.
  const busy = loading || googleLoading || facebookLoading;

  const handleLogin = async () => {
    if (busy) return;
    if (!email || !password) {
      Alert.alert(t("auth.login.missing.title"), t("auth.login.missing.message"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      Alert.alert(t("auth.login.failed.title"), error.message);
    } else {
      router.replace("/(tabs)/home");
    }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    if (busy) return;
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // The root layout routes away once onAuthStateChange reports a session;
      // navigating here keeps the flow identical to email sign-in.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) router.replace("/(tabs)/home");
    } catch (error: unknown) {
      Alert.alert(
        t("auth.login.google_failed.title"),
        error instanceof Error ? error.message : t("auth.common.try_again"),
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleFacebookAuth = async () => {
    if (busy) return;
    setFacebookLoading(true);
    try {
      await signInWithFacebook();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) router.replace("/(tabs)/home");
    } catch (error: unknown) {
      Alert.alert(
        t("auth.login.facebook_failed.title"),
        error instanceof Error ? error.message : t("auth.common.try_again"),
      );
    } finally {
      setFacebookLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <AuthHero
            title={t("auth.login.title")}
            subtitle={t("auth.login.subtitle")}
            onBack={() => router.back()}
          />

          <AuthCard>
            <FormField
              label={t("auth.common.email_label")}
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder={t("auth.common.email_placeholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!busy}
            />

            <FormField
              label={t("auth.common.password_label")}
              icon="lock-closed-outline"
              secure
              value={password}
              onChangeText={setPassword}
              placeholder={t("auth.login.password_placeholder")}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!busy}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/forgot-password")}
              hitSlop={8}
              style={styles.forgotWrap}
            >
              <Text style={styles.forgotText}>{t("auth.login.forgot")}</Text>
            </Pressable>

            <AppButton
              label={t("auth.login.submit")}
              onPress={handleLogin}
              loading={loading}
              disabled={busy}
              style={styles.pill}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t("auth.common.continue_with")}</Text>
              <View style={styles.dividerLine} />
            </View>

            <OAuthButtons
              onGoogle={handleGoogleAuth}
              onFacebook={handleFacebookAuth}
              googleLoading={googleLoading}
              facebookLoading={facebookLoading}
              disabled={loading}
            />
          </AuthCard>

          <Text style={styles.note}>
            {t("auth.login.note")}
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Text style={styles.footerText}>{t("auth.login.footer.question")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/signup")}
            hitSlop={8}
          >
            <Text style={styles.footerLink}>{t("auth.login.footer.action")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scroll: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingBottom: theme.spacing.lg,
  },
  forgotWrap: { alignSelf: "flex-end", marginTop: -2, marginBottom: theme.spacing.lg },
  forgotText: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  pill: { borderRadius: theme.borderRadius.pill },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: theme.spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  note: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    color: theme.colors.textMuted,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.page,
  },
  footerText: { fontSize: 14, fontWeight: "500", color: theme.colors.textMuted },
  footerLink: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
}));
