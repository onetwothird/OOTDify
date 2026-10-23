// C:\OOTDify\src\app\(auth)\signup.tsx
// Signup — a three-step wizard: details → photo → agree & create.
//
// The photo step is optional and a live preview only. Nothing is uploaded
// while signed out: the file is remembered locally (tagged with the signup
// email) and attached to the profile right after that account first signs in.
//
// The terms checkbox gates every path (including OAuth), and the accepted
// version + timestamp are recorded in auth metadata at sign-up; the backend
// independently rejects AI processing without that record (403 consent_required).
import { Ionicons } from "@expo/vector-icons";

import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  pickAvatarPhoto,
  savePendingAvatar,
  clearPendingAvatar,
} from "../../features/profile/avatar";

import { markOnboardingPending } from "../../features/profile/onboarding";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
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

const STEPS = ["Details", "Photo", "Finish"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const STEP_COPY = [
  {
    title: "Create your account",
    subtitle: "Your wardrobe, organised in minutes.",
  },
  {
    title: "Add your photo",
    subtitle: "Optional — skip it now and add one later from Profile.",
  },
  {
    title: "One last step",
    subtitle: "Agree to the terms and your account is ready.",
  },
] as const;

function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function SignupScreen() {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<{ uri: string } & Record<string, unknown> | null>(null);
  const [picking, setPicking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const busy = loading || googleLoading || facebookLoading;

  const rules = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "A letter", ok: /[a-zA-Z]/.test(password) },
    { label: "A number", ok: /\d/.test(password) },
  ];
  const passwordOk = rules.every((r) => r.ok);


  const [slide] = useState(() => new Animated.Value(1));
  const transition = (next: number) => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 130,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setStep(next);
      setError(null);
      Animated.timing(slide, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const goBack = () => {
    if (busy) return;
    if (step === 0) router.back();
    else transition(step - 1);
  };

  const goNext = () => {
    if (busy) return;
    if (step === 0) {
      if (fullName.trim().length < 2) {
        setError("Please tell us the name you'd like us to use.");
        return;
      }
      if (!EMAIL_RE.test(email.trim())) {
        setError("That email address doesn't look right.");
        return;
      }
      if (!passwordOk) {
        setError("Please choose a password that meets all three rules.");
        return;
      }
    }
    transition(Math.min(step + 1, STEPS.length - 1));
  };

  const choosePhoto = (source: "library" | "camera") => {
    void (async () => {
      setPicking(true);
      const picked = await pickAvatarPhoto(source);
      setPicking(false);
      if (picked) setPhoto(picked as unknown as { uri: string } & Record<string, unknown>);
    })();
  };

  const rememberChoice = async (accountEmail: string | null | undefined) => {
    if (!accountEmail) return;
    if (photo) await savePendingAvatar(photo.uri, accountEmail);
    else await clearPendingAvatar();
    await markOnboardingPending(accountEmail);
  };

  const handleSignup = async () => {
    if (busy) return;
    if (!agreed) {
      setError(CONSENT_MESSAGE);
      return;
    }

    setLoading(true);
    setError(null);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      // Nothing is remembered for an account that was never created.
      setError(signUpError.message);
      return;
    }

    // Signing up must NOT sign you in. When email confirmation is off, Supabase
    // returns a live session from signUp — drop it so creating an account and
    // entering it stay separate steps, exactly as the copy below says. `local`
    // scope clears this device only; other devices are untouched.
    if (signUpData.session) {
      await supabase.auth.signOut({ scope: "local" });
    }
    setLoading(false);

    // Only now can these belong to an account.
    await rememberChoice(email.trim());
    Alert.alert(
      "Account created",
      "Log in and your photo is applied automatically — it is never uploaded before you have an account.",
      [{ text: "Log in", onPress: () => router.replace("/login") }],
    );
  };

  const handleGoogleAuth = async () => {
    if (busy) return;
    if (!agreed) {
      setError(CONSENT_MESSAGE);
      return;
    }
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await rememberChoice(session.user.email);
        router.replace("/(tabs)/home");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleFacebookAuth = async () => {
    if (busy) return;
    if (!agreed) {
      setError(CONSENT_MESSAGE);
      return;
    }
    setFacebookLoading(true);
    setError(null);
    try {
      await signInWithFacebook();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) await rememberChoice(session.user.email);
      if (session) router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Facebook sign-in failed. Please try again.");
    } finally {
      setFacebookLoading(false);
    }
  };

  const copy = STEP_COPY[step];
  const avatarInitial = (fullName.trim()[0] || email.trim()[0] || "").toUpperCase();

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
          <AuthHero title={copy.title} subtitle={copy.subtitle} onBack={goBack} />

          <AuthCard>
            {/* Progress rail — where you are in the process */}
            <View style={styles.rail}>
              {STEPS.map((label, index) => {
                const done = index < step;
                const current = index === step;
                return (
                  <View key={label} style={styles.railItem}>
                    <View
                      style={[
                        styles.railBar,
                        done && styles.railBarDone,
                        current && styles.railBarCurrent,
                      ]}
                    />
                    <Text style={[styles.railLabel, (done || current) && styles.railLabelOn]}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Animated.View
              style={{
                opacity: slide,
                transform: [
                  {
                    translateY: slide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              }}
            >
              {step === 0 ? (
                <>
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
                    editable={!busy}
                  />

                  <View style={styles.rules}>
                    {rules.map((rule) => (
                      <View key={rule.label} style={styles.rule}>
                        <Ionicons
                          name={rule.ok ? "checkmark-circle" : "ellipse-outline"}
                          size={15}
                          color={rule.ok ? theme.colors.success : theme.colors.textMuted}
                        />
                        <Text style={[styles.ruleText, rule.ok && styles.ruleTextOn]}>
                          {rule.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <View style={styles.previewWrap}>
                    <ProfileAvatar
                      size={128}
                      initial={avatarInitial}
                      avatarRef={null}
                      uri={photo?.uri ?? null}
                      busy={picking}
                      ring={theme.colors.border}
                      background={theme.colors.surfaceAlt}
                      color={theme.colors.text}
                    />
                    <Text style={styles.previewHint}>
                      {photo
                        ? "This is exactly what your profile will show."
                        : "Take one now, pick one you already like — or skip it entirely."}
                    </Text>
                  </View>

                  <View style={styles.photoActions}>
                    <AppButton
                      label={photo ? "Retake photo" : "Take photo"}
                      icon="camera-outline"
                      onPress={() => choosePhoto("camera")}
                      disabled={busy || picking}
                      style={styles.pill}
                    />
                    <AppButton
                      label="Choose from library"
                      icon="images-outline"
                      variant="secondary"
                      onPress={() => choosePhoto("library")}
                      disabled={busy || picking}
                      style={styles.pill}
                    />
                  </View>

                  {photo ? <PhotoFacts photo={photo} /> : null}

                  <Text style={styles.stepNote}>
                    Nothing is uploaded yet — the photo is kept on this device and attached
                    after you sign in.
                  </Text>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <View style={styles.summary}>
                    <ProfileAvatar
                      size={56}
                      initial={avatarInitial}
                      avatarRef={null}
                      uri={photo?.uri ?? null}
                      background={theme.colors.surfaceAlt}
                      color={theme.colors.text}
                      ring={theme.colors.border}
                    />
                    <View style={styles.summaryBody}>
                      <Text style={styles.summaryName} numberOfLines={1}>
                        {fullName.trim() || "Your account"}
                      </Text>
                      <Text style={styles.summaryEmail} numberOfLines={1}>
                        {email.trim() || "No email yet"}
                      </Text>
                      <Text style={styles.summaryMeta}>
                        {photo ? "Photo ready to attach after sign-in" : "No photo yet — you can add one later"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.consentCard}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: agreed }}
                      accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
                      onPress={() => {
                        setAgreed((value) => !value);
                        setError(null);
                      }}
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
                </>
              ) : null}
            </Animated.View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {step < STEPS.length - 1 ? (
              <AppButton
                label={step === 1 && !photo ? "Skip for now" : "Continue"}
                icon="arrow-forward"
                onPress={goNext}
                disabled={busy}
                style={[styles.pill, styles.continueBtn]}
              />
            ) : null}
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

/** The real, OS-reported facts about the chosen file — nothing invented. */
function PhotoFacts({ photo }: { photo: { uri: string } & Record<string, unknown> }) {
  const width = typeof photo.width === "number" ? photo.width : 0;
  const height = typeof photo.height === "number" ? photo.height : 0;
  const fileSize = typeof photo.fileSize === "number" ? photo.fileSize : null;
  const mimeType = typeof photo.mimeType === "string" ? photo.mimeType : null;
  const size = formatBytes(fileSize);

  const facts: { label: string; value: string }[] = [
    {
      label: photo.source === "camera" ? "Captured live" : "From your library",
      value: photo.source === "camera" ? "front camera" : "on device",
    },
  ];
  if (width && height) {
    facts.push({
      label: "Square crop",
      value: `${width} × ${height}`,
    });
  }
  if (size) facts.push({ label: "Image", value: `${mimeType ?? "image"} · ${size}` });

  return (
    <View style={styles.facts}>
      {facts.map((f) => (
        <View key={f.label} style={styles.factRow}>
          <Ionicons name="checkmark-circle" size={15} color={theme.colors.success} />
          <Text style={styles.factLabel}>{f.label}</Text>
          <Text style={styles.factValue}>{f.value}</Text>
        </View>
      ))}
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

  // Progress rail
  rail: { flexDirection: "row", gap: 8, marginBottom: theme.spacing.lg },
  railItem: { flex: 1, gap: 6 },
  railBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  railBarDone: { backgroundColor: theme.colors.primary },
  railBarCurrent: { backgroundColor: theme.colors.primary },
  railLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  railLabelOn: { color: theme.colors.text },

  // Password rules
  rules: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: theme.spacing.md },
  rule: { flexDirection: "row", alignItems: "center", gap: 5 },
  ruleText: { fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },
  ruleTextOn: { color: theme.colors.text },

  // Photo step
  previewWrap: { alignItems: "center", gap: 12, marginBottom: theme.spacing.lg },
  previewHint: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.textMuted,
    paddingHorizontal: 12,
  },
  photoActions: { gap: 10, marginBottom: theme.spacing.md },
  facts: {
    gap: 8,
    padding: 14,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  factRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  factLabel: { flex: 1, fontSize: 12.5, fontWeight: "700", color: theme.colors.text },
  factValue: { fontSize: 12, color: theme.colors.textMuted },

  stepNote: {
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },

  // Review step
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  summaryBody: { flex: 1, minWidth: 0 },
  summaryName: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  summaryEmail: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },
  summaryMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 6 },

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
  consentLink: { color: theme.colors.text, fontWeight: "800" },

  pill: { borderRadius: theme.borderRadius.pill },
  continueBtn: { marginTop: theme.spacing.sm },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: theme.spacing.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  dividerText: { marginHorizontal: 12, fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: theme.spacing.md,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: "rgba(178,58,46,0.08)",
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "600", color: theme.colors.danger },

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
