// C:\OOTDify\src\app\(auth)\signup.tsx
// Signup screen — account creation with email/password or Google / Facebook.
// The terms checkbox gates every path (including OAuth), and the accepted
// version + timestamp are recorded in auth metadata at sign-up; the backend
// independently rejects AI processing without that record (403 consent_required).
import { Ionicons } from "@expo/vector-icons";
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
import { PRIVACY_ROUTE, TERMS_ROUTE, TERMS_VERSION } from "../../shared/config/legal";
import { theme } from "../../shared/config/theme";
import { signInWithFacebook, signInWithGoogle } from "../../shared/lib/oauth";
import { supabase } from "../../shared/lib/supabase";

const CONSENT_MESSAGE =
  "Please agree to the Terms of Service and Privacy Policy to create an account.";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  // One in-flight action at a time: taps during any auth attempt are no-ops.
  const busy = loading || googleLoading || facebookLoading;

  const handleSignup = async () => {
    if (busy) return;
    if (!fullName || !email || !password) {
      Alert.alert("Missing details", "Please fill in your name, email and password.");
      return;
    }
    if (!agreed) {
      Alert.alert("Terms required", CONSENT_MESSAGE);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      Alert.alert("Signup failed", error.message);
    } else {
      await supabase.auth.signOut();
      Alert.alert("Account created", "You can now log in with your new account.", [
        { text: "OK", onPress: () => router.replace("/(auth)") },
      ]);
    }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    if (busy) return;
    if (!agreed) {
      Alert.alert("Terms required", CONSENT_MESSAGE);
      return;
    }
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // The root layout routes OAuth accounts with no recorded version to the
      // consent screen, so navigating here is safe either way.
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
    if (!agreed) {
      Alert.alert("Terms required", CONSENT_MESSAGE);
      return;
    }
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
    <View style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <AuthHero
            title="Create your account"
            subtitle="Your wardrobe, organised in minutes."
            onBack={() => router.back()}
          />

          <AuthCard>
            <FormField
              label="Full name"
              icon="person-outline"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              editable={!busy}
            />

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
              placeholder="Create a password"
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              editable={!busy}
            />

            <View style={styles.consentCard}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
                onPress={() => setAgreed((value) => !value)}
                hitSlop={6}
                style={styles.checkboxHit}
              >
                <Ionicons
                  name={agreed ? "checkbox" : "square-outline"}
                  size={22}
                  color={agreed ? theme.colors.primary : theme.colors.textMuted}
                />
              </Pressable>
              <Text style={styles.consentText}>
                I agree to the{" "}
                <Text
                  accessibilityRole="link"
                  style={styles.consentLink}
                  onPress={() => router.push(TERMS_ROUTE)}
                >
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text
                  accessibilityRole="link"
                  style={styles.consentLink}
                  onPress={() => router.push(PRIVACY_ROUTE)}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>

            <AppButton
              label="Create account"
              onPress={handleSignup}
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
          </AuthCard>

          <Text style={styles.note}>
            Body photos you scan stay in your private account and are used only
            for the AI features you ask for.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/login")}
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Log in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scroll: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingBottom: theme.spacing.lg,
  },
  consentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  checkboxHit: { paddingTop: 1 },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: theme.colors.text,
  },
  consentLink: {
    color: theme.colors.text,
    fontWeight: "800",
  },
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
});
