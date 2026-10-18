// C:\OOTDify\src\app\(auth)\login.tsx
// Login screen — email/password plus Google and Facebook sign-in.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "../../shared/components/AppButton";
import { FormField } from "../../shared/components/FormField";
import { OAuthButtons } from "../../shared/components/OAuthButtons";
import { theme } from "../../shared/config/theme";
import { signInWithFacebook, signInWithGoogle } from "../../shared/lib/oauth";
import { supabase } from "../../shared/lib/supabase";

export default function LoginScreen() {
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
      Alert.alert("Missing details", "Please enter both your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      Alert.alert("Login failed", error.message);
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
        "Google sign-in failed",
        error instanceof Error ? error.message : "Please try again.",
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
        "Facebook sign-in failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setFacebookLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to pick up where you left off.</Text>

          <View style={styles.form}>
            <FormField
              label="Email address"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!busy}
            />

            <FormField
              label="Password"
              icon="lock-closed-outline"
              secure
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
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
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            <AppButton
              label="Log in"
              onPress={handleLogin}
              loading={loading}
              disabled={busy}
              style={styles.pill}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <OAuthButtons
              onGoogle={handleGoogleAuth}
              onFacebook={handleFacebookAuth}
              googleLoading={googleLoading}
              facebookLoading={facebookLoading}
              disabled={loading}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>New to OOTDify? </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/signup")}
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Create an account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  header: {
    paddingHorizontal: theme.spacing.page,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  pressed: { opacity: 0.7 },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    color: theme.colors.textMuted,
    marginTop: 6,
    marginBottom: theme.spacing.xl,
  },
  form: { width: "100%" },
  forgotWrap: { alignSelf: "flex-end", marginBottom: theme.spacing.lg, marginTop: -4 },
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.page,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  footerText: { fontSize: 14, fontWeight: "500", color: theme.colors.textMuted },
  footerLink: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
});
