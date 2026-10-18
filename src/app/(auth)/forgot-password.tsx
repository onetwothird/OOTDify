// C:\OOTDify\src\app\(auth)\forgot-password.tsx
// Password reset request — shares the auth shell (AuthHero/AuthCard) so the
// hero, card and field styling match login and signup exactly.
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../../shared/components/AppButton";
import { AuthCard, AuthHero } from "../../shared/components/AuthShell";
import { FormField } from "../../shared/components/FormField";
import { theme } from "../../shared/config/theme";
import { supabase } from "../../shared/lib/supabase";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (loading) return;
    if (!email) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      Alert.alert("Could not send link", error.message);
    } else {
      Alert.alert("Check your inbox", "We sent you a password reset link.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
    setLoading(false);
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
            title="Reset password"
            subtitle="We'll email you a secure link to set a new one."
            onBack={() => router.back()}
          />

          <AuthCard>
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
              returnKeyType="send"
              onSubmitEditing={handleReset}
              editable={!loading}
            />

            <AppButton
              label="Send reset link"
              onPress={handleReset}
              loading={loading}
              disabled={loading}
              style={styles.pill}
            />
          </AuthCard>

          <Text style={styles.note}>
            The link expires shortly. If it doesn&apos;t arrive, check your spam
            folder before requesting another.
          </Text>
        </ScrollView>
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
  pill: { borderRadius: theme.borderRadius.pill },
  note: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    color: theme.colors.textMuted,
  },
});
