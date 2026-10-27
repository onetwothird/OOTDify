// C:\OOTDify\src\app\(auth)\forgot-password.tsx
// Password reset request — shares the auth shell (AuthHero/AuthCard) so the
// hero, card and field styling match login and signup exactly.
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AppButton } from "../../shared/components/AppButton";
import { AuthCard, AuthHero } from "../../shared/components/AuthShell";
import { FormField } from "../../shared/components/FormField";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { supabase } from "../../shared/lib/supabase";

export default function ForgotPasswordScreen() {
  const styles = useStyles();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (loading) return;
    if (!email) {
      Alert.alert(t("auth.forgot_password.missing.title"), t("auth.forgot_password.missing.message"));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      Alert.alert(t("auth.forgot_password.failed.title"), error.message);
    } else {
      Alert.alert(t("auth.forgot_password.sent.title"), t("auth.forgot_password.sent.message"), [
        { text: t("auth.forgot_password.sent.ok"), onPress: () => router.back() },
      ]);
    }
    setLoading(false);
  };

  return (
    <View style={styles.screen}>
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
            title={t("auth.forgot_password.title")}
            subtitle={t("auth.forgot_password.subtitle")}
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
              returnKeyType="send"
              onSubmitEditing={handleReset}
              editable={!loading}
            />

            <AppButton
              label={t("auth.forgot_password.submit")}
              onPress={handleReset}
              loading={loading}
              disabled={loading}
              style={styles.pill}
            />
          </AuthCard>

          <Text style={styles.note}>
            {t("auth.forgot_password.note")}
          </Text>
        </ScrollView>
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
  pill: { borderRadius: theme.borderRadius.pill },
  note: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    color: theme.colors.textMuted,
  },
}));
