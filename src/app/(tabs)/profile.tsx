// C:\OOTDify\src\app\(tabs)\profile.tsx
// Profile — the settings hub. Identity + fashion preferences (real, persisted
// via the Flask backend /api/profile), device settings (language, appearance,
// biometric unlock via features/settings/SettingsSection), Privacy & Data
// controls, and sign out. Reachable from the Home header avatar — it is
// intentionally not a menu tab (Community took that slot).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { CATALOG_CATEGORIES, OCCASIONS } from "../../features/clothing/types";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { captureSelfie, promptAvatarChange } from "../../features/profile/avatar";
import { useAvatarStore } from "../../features/profile/avatarStore";
import { SettingsSection } from "../../features/settings/SettingsSection";
import { AppButton } from "../../shared/components/AppButton";
import { ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { theme } from "../../shared/config/theme";
import { supabase } from "../../shared/lib/supabase";
import { toast } from "../../shared/lib/toast";
import {
  checkBackendHealth,
  checkProfilePhoto,
  getProfile,
  updateProfile,
} from "../../services/aiApi";
import type { HealthResult } from "../../services/aiApi";

const STYLES = ["Minimal", "Streetwear", "Classic", "Sporty", "Smart casual", "Vintage", "Edgy"];
const COLORS = ["Black", "White", "Neutral", "Pastel", "Bold", "Earthy"];
const SIZES = ["XS", "S", "M", "L", "XL"];
const GENDERS = ["men", "women", "unisex"] as const;

/** Plain-language explanation for a failed photo check. */
function photoCheckReason(reason: string | null): string {
  switch (reason) {
    case "no_person":
      return "Nobody was detected in the frame. Face the camera and try again.";
    case "face_not_visible":
      return "A person was found, but the face wasn't clear. Try brighter light and a closer frame.";
    default:
      return "The check didn't pass. Try again in good light with your face in the frame.";
  }
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openCapture = useCaptureModalStore((s) => s.open);
  const { width } = useWindowDimensions();
  const condensed = width < 380;

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // Shared so the home header shows a change the moment it happens.
  const avatarRef = useAvatarStore((s) => s.ref);
  const setAvatarRef = useAvatarStore((s) => s.setRef);
  const photoCheck = useAvatarStore((s) => s.check);
  const setPhotoCheck = useAvatarStore((s) => s.setCheck);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [gender, setGender] = useState("");
  const [stylesSel, setStylesSel] = useState<Set<string>>(new Set());
  const [colorsSel, setColorsSel] = useState<Set<string>>(new Set());
  const [occasionsSel, setOccasionsSel] = useState<Set<string>>(new Set());
  const [sizesSel, setSizesSel] = useState<Set<string>>(new Set());
  const [categoriesSel, setCategoriesSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ---- AI backend /health probe --------------------------------------------
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(true);
  // Core probe — effect-safe (no synchronous setState); state starts as checking.
  const probeHealth = useCallback(async () => {
    const result = await checkBackendHealth();
    setHealth(result);
    setChecking(false);
  }, []);

  // Handler-facing wrapper: show the spinner on manual re-checks.
  const checkHealth = useCallback(async () => {
    setChecking(true);
    await probeHealth();
  }, [probeHealth]);

  useEffect(() => {
    // Microtask kick-off: no setState runs synchronously within the effect body.
    Promise.resolve()
      .then(() => probeHealth())
      .catch(() => {});
  }, [probeHealth]);

  // Core loader — effect-safe (no synchronous setState); state starts as loading.
  const fetchProfile = useCallback(async () => {
    try {
      const { profile: p, email: mail } = await getProfile();
      setEmail(mail);
      setFirstName(p.first_name ?? "");
      setLastName(p.last_name ?? "");
      setAvatarRef(p.avatar_url ?? null);
      setGender(p.gender ?? "");
      setStylesSel(new Set(p.preferred_styles ?? []));
      setColorsSel(new Set(p.preferred_colors ?? []));
      setOccasionsSel(new Set(p.preferred_occasions ?? []));
      setSizesSel(new Set(p.sizes ?? []));
      setCategoriesSel(new Set(p.preferred_categories ?? []));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [setAvatarRef]);

  // Handler-facing wrapper: show the spinner and clear the previous error.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    // Microtask kick-off: no setState runs synchronously within the effect body.
    Promise.resolve()
      .then(() => fetchProfile())
      .catch(() => {});
  }, [fetchProfile]);

  const markDirty = () => setDirty(true);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const save = async () => {
    setSaving(true);
    try {
      const f = firstName.trim();
      const l = lastName.trim();
      const derived = [f, l].filter(Boolean).join(" ") || null;
      await updateProfile({
        first_name: f || null,
        last_name: l || null,
        gender: gender || null,
        display_name: derived,
        preferred_styles: Array.from(stylesSel),
        preferred_colors: Array.from(colorsSel),
        preferred_occasions: Array.from(occasionsSel),
        preferred_categories: Array.from(categoriesSel),
        sizes: Array.from(sizesSel),
      });
      setDirty(false);
      toast.success("Profile updated", "Your preferences now shape recommendations.");
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : "Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    void supabase.auth.signOut();
  };

  // Runs the real models on a fresh selfie. The frame is analysed and discarded
  // server-side, so this leaves no stored copy behind.
  const runPhotoCheck = useCallback(async () => {
    const selfie = await captureSelfie();
    if (!selfie) return;
    setCheckingPhoto(true);
    try {
      const result = await checkProfilePhoto(selfie.uri);
      setPhotoCheck({ ...result, checkedAt: new Date().toISOString() });
      if (result.ok) {
        toast.success("Selfie check passed", "A live person with a clear face was detected.");
      } else {
        toast.error("Selfie check didn't pass", photoCheckReason(result.reason));
      }
    } catch (e) {
      toast.error(
        "Couldn't run the check",
        e instanceof Error ? e.message : "Please try again in a moment.",
      );
    } finally {
      setCheckingPhoto(false);
    }
  }, [setPhotoCheck]);

  const avatarInitial = (
    firstName.trim()[0] ||
    lastName.trim()[0] ||
    email?.[0] ||
    "?"
  ).toUpperCase();
  const displayName =
    [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "Profile";

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Profile"
          subtitle="Your preferences shape real recommendations."
        />

        {loading ? (
          <LoadingState label="Loading profile" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            {/* Identity hero */}
            <View style={styles.heroCard}>
              <View style={[styles.heroBlob, styles.heroBlobA]} pointerEvents="none" />
              <View style={[styles.heroBlob, styles.heroBlobB]} pointerEvents="none" />
              <View style={styles.heroRow}>
                <ProfileAvatar
                  size={78}
                  initial={avatarInitial}
                  avatarRef={avatarRef}
                  onChanged={setAvatarRef}
                  badge
                  background={theme.colors.surface}
                  color={theme.colors.text}
                  badgeRing={theme.colors.primary}
                  badgeBackground={theme.colors.surface}
                  badgeColor={theme.colors.text}
                />
                <View style={styles.heroBody}>
                  <Text style={styles.heroName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.heroEmail} numberOfLines={1}>
                    {email ?? "Signed in"}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => promptAvatarChange(setAvatarRef)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.heroAction,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="camera-outline" size={13} color={theme.colors.onPrimary} />
                    <Text style={styles.heroActionText}>Change photo</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <SectionLabel text="PHOTO CHECK" />
            <View style={styles.card}>
              {photoCheck ? (
                <>
                  <View style={styles.checkHead}>
                    <View
                      style={[
                        styles.checkDot,
                        photoCheck.ok ? styles.checkDotOk : styles.checkDotWarn,
                      ]}
                    />
                    <Text style={styles.checkTitle}>
                      {photoCheck.ok ? "Selfie check passed" : "Another try needed"}
                    </Text>
                  </View>
                  <Text style={styles.checkText}>
                    {photoCheck.ok
                      ? `A person was detected (${Math.round(
                          (photoCheck.personConfidence ?? 0) * 100,
                        )}% confidence) with ${photoCheck.faceKeypoints} of 5 face points and ${photoCheck.keypointsVisible} of 17 body points located.`
                      : photoCheckReason(photoCheck.reason)}
                  </Text>
                </>
              ) : (
                <Text style={styles.checkText}>
                  Confirms a person is really in frame, using the same body-model
                  models as the try-on. The selfie is analysed and discarded — no
                  copy is kept.
                </Text>
              )}
              {photoCheck ? (
                <Text style={styles.checkMeta}>
                  Checked at {formatClock(photoCheck.checkedAt)} · image not stored
                </Text>
              ) : null}
              <AppButton
                label={photoCheck ? "Run the check again" : "Run selfie check"}
                icon="scan-outline"
                variant="secondary"
                size="md"
                loading={checkingPhoto}
                onPress={() => void runPhotoCheck()}
              />
            </View>

            <SectionLabel text="PERSONAL DETAILS" />
            <View style={styles.card}>
              <View style={[styles.nameRow, condensed && styles.nameRowStacked]}>
                <View style={styles.nameField}>
                  <Text style={styles.fieldLabel}>FIRST NAME</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={firstName}
                    onChangeText={(t) => {
                      setFirstName(t);
                      markDirty();
                    }}
                    placeholder="First name"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={40}
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.nameField}>
                  <Text style={styles.fieldLabel}>LAST NAME</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={lastName}
                    onChangeText={(t) => {
                      setLastName(t);
                      markDirty();
                    }}
                    placeholder="Last name"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={40}
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.genderGroup}>
                <Text style={styles.fieldLabel}>I SHOP FOR</Text>
                <View style={styles.prefChips}>
                  {GENDERS.map((g) => {
                    const active = gender === g;
                    return (
                      <Pressable
                        key={g}
                        accessibilityRole="button"
                        onPress={() => {
                          setGender(active ? "" : g);
                          markDirty();
                        }}
                        style={[styles.prefChip, active && styles.prefChipActive]}
                      >
                        <Text
                          style={[styles.prefChipText, active && styles.prefChipTextActive]}
                        >
                          {g[0].toUpperCase() + g.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Preferences */}
            <SectionLabel text="YOUR STYLE" />
            <View style={styles.card}>
              <PrefGroup
                label="Styles"
                options={STYLES}
                selected={stylesSel}
                onToggle={(k) => {
                  setStylesSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label="Colors"
                options={COLORS}
                selected={colorsSel}
                onToggle={(k) => {
                  setColorsSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label="Sizes"
                options={SIZES}
                selected={sizesSel}
                onToggle={(k) => {
                  setSizesSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label="Occasions"
                options={Array.from(OCCASIONS)}
                selected={occasionsSel}
                onToggle={(k) => {
                  setOccasionsSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label="Categories"
                options={Array.from(CATALOG_CATEGORIES)}
                selected={categoriesSel}
                onToggle={(k) => {
                  setCategoriesSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
            </View>

            <AppButton
              label="Save preferences"
              loading={saving}
              disabled={!dirty && !firstName.trim() && !lastName.trim()}
              onPress={save}
            />

            {/* AI service status (real /health probe) */}
            <SectionLabel text="AI SERVICE" />
            <View style={styles.card}>
              {checking ? (
                <View style={styles.serviceRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.serviceText}>Checking AI service…</Text>
                </View>
              ) : health?.ok ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void checkHealth()}
                  style={styles.serviceRow}
                >
                  <View style={[styles.serviceDot, styles.serviceDotOk]} />
                  <View style={styles.serviceBody}>
                    <Text style={styles.serviceTitle}>AI service connected</Text>
                    <Text style={styles.serviceText}>
                      {health.modelLoaded
                        ? "Style engine and body-scan models are ready."
                        : "Connected — style models are warming up."}
                    </Text>
                  </View>
                  <Ionicons name="refresh" size={15} color={theme.colors.textMuted} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void checkHealth()}
                  style={styles.serviceRow}
                >
                  <View style={[styles.serviceDot, styles.serviceDotWarn]} />
                  <View style={styles.serviceBody}>
                    <Text style={styles.serviceTitle}>AI styling is unavailable</Text>
                    <Text style={styles.serviceText}>
                      {health?.message ??
                        "Make sure the AI service is running, then retry."}
                    </Text>
                  </View>
                  <Text style={styles.serviceRetry}>Retry</Text>
                </Pressable>
              )}
            </View>

            {/* Settings — Profile is the settings hub */}
            <SettingsSection />

            {/* Privacy & legal */}
            <SectionLabel text="PRIVACY & DATA" />
            <View style={styles.card}>
              <LinkRow
                icon="shield-checkmark-outline"
                label="Privacy & Data"
                hint="Body photos, downloads, account deletion"
                onPress={() => router.push("/privacy/data")}
              />
              <LinkRow
                icon="document-text-outline"
                label="Privacy Policy"
                onPress={() => router.push("/privacy/policy")}
              />
              <LinkRow
                icon="receipt-outline"
                label="Terms of Service"
                onPress={() => router.push("/privacy/terms")}
              />
            </View>

            {/* Closet shortcut */}
            <SectionLabel text="QUICK ACTIONS" />
            <View style={styles.card}>
              <LinkRow
                icon="shirt-outline"
                label="Add clothes to my closet"
                onPress={openCapture}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              style={styles.signOut}
              onPress={signOut}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  );
}

function PrefGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <View style={styles.prefGroup}>
      <Text style={styles.prefLabel}>{label}</Text>
      <View style={styles.prefChips}>
        {options.map((opt) => {
          const active = selected.has(opt);
          return (
            <Pressable
              key={opt}
              accessibilityRole="button"
              onPress={() => onToggle(opt)}
              style={[styles.prefChip, active && styles.prefChipActive]}
            >
              <Text style={[styles.prefChipText, active && styles.prefChipTextActive]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <View style={styles.linkBody}>
        <Text style={styles.linkLabel}>{label}</Text>
        {hint ? <Text style={styles.linkHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  sectionBar: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 14,
  },
  heroCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: 18,
    overflow: "hidden",
  },
  heroBlob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroBlobA: { width: 200, height: 200, top: -90, right: -60 },
  heroBlobB: {
    width: 130,
    height: 130,
    bottom: -70,
    left: -40,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroBody: { flex: 1, minWidth: 0 },
  heroAction: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  heroActionText: {
    color: theme.colors.onPrimary,
    fontSize: 12.5,
    fontWeight: "700",
  },
  checkHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkDot: { width: 9, height: 9, borderRadius: 5 },
  checkDotOk: { backgroundColor: theme.colors.success },
  checkDotWarn: { backgroundColor: theme.colors.warning },
  checkTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  checkText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  checkMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  heroName: {
    color: theme.colors.onPrimary,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  heroEmail: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12.5,
    marginTop: 3,
  },
  nameRow: { flexDirection: "row", gap: 12 },
  nameRowStacked: { flexDirection: "column", gap: 12 },
  nameField: { flex: 1, minWidth: 0 },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  genderGroup: { gap: 8 },
  nameInput: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceAlt,
  },
  prefGroup: { gap: 8 },
  prefLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted },
  prefChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  prefChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  prefChipActive: { backgroundColor: theme.colors.primary },
  prefChipText: { fontSize: 12.5, fontWeight: "600", color: theme.colors.text },
  prefChipTextActive: { color: "#FFF" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  linkBody: { flex: 1, minWidth: 0 },
  linkLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  linkHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  serviceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  serviceDotOk: { backgroundColor: theme.colors.success },
  serviceDotWarn: { backgroundColor: theme.colors.warning },
  serviceBody: { flex: 1, minWidth: 0 },
  serviceTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  serviceText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
    marginTop: 2,
  },
  serviceRetry: {
    fontSize: 12.5,
    fontWeight: "800",
    color: theme.colors.primary,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
  },
  signOutText: { color: theme.colors.danger, fontWeight: "700", fontSize: 15 },
});