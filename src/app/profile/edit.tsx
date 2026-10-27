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
  LayoutChangeEvent,
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
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { I18n } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
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

type SectionKey = "you" | "style" | "settings" | "privacy";

const SECTIONS: {
  key: SectionKey;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: TranslationKey;
}[] = [
  { key: "you", icon: "person-outline", labelKey: "profile.nav.you" },
  { key: "style", icon: "color-palette-outline", labelKey: "profile.nav.style" },
  { key: "settings", icon: "settings-outline", labelKey: "profile.nav.settings" },
  { key: "privacy", icon: "shield-checkmark-outline", labelKey: "profile.nav.privacy" },
];

/** Plain-language explanation for a failed photo check. */
function photoCheckReason(reason: string | null, t: I18n["t"]): string {
  switch (reason) {
    case "no_person":
      return t("profile.photo_check.reason.no_person");
    case "face_not_visible":
      return t("profile.photo_check.reason.face_not_visible");
    default:
      return t("profile.photo_check.reason.default");
  }
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const openCapture = useCaptureModalStore((s) => s.open);
  const { width } = useWindowDimensions();
  const condensed = width < 380;

  // State, not refs: the scroller is kept via a callback ref and section
  // offsets come from layout callbacks.
  const [scroller, setScroller] = useState<{
    scrollTo: (options: { y: number; animated?: boolean }) => void;
  } | null>(null);
  const [sectionY, setSectionY] = useState<Partial<Record<SectionKey, number>>>({});
  const markSection = (key: SectionKey) => (e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y;
    setSectionY((prev) => (prev[key] === y ? prev : { ...prev, [key]: y }));
  };
  const jumpTo = (key: SectionKey) => {
    const y = sectionY[key];
    if (y !== undefined) scroller?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

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
      setError(e instanceof Error ? e.message : t("profile.error.load"));
    } finally {
      setLoading(false);
    }
  }, [setAvatarRef, t]);

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
      toast.success(t("profile.toast.updated.title"), t("profile.toast.updated.message"));
    } catch (e) {
      toast.error(t("profile.toast.save_error.title"), e instanceof Error ? e.message : t("profile.toast.save_error.message"));
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
        toast.success(t("profile.photo_check.passed"), t("profile.toast.check_passed.message"));
      } else {
        toast.error(t("profile.toast.check_failed.title"), photoCheckReason(result.reason, t));
      }
    } catch (e) {
      toast.error(
        t("profile.toast.check_error.title"),
        e instanceof Error ? e.message : t("profile.toast.check_error.message"),
      );
    } finally {
      setCheckingPhoto(false);
    }
  }, [setPhotoCheck, t]);

  const avatarInitial = (
    firstName.trim()[0] ||
    lastName.trim()[0] ||
    email?.[0] ||
    "?"
  ).toUpperCase();
  const displayName =
    [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || t("profile.default_name");

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={setScroller}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title={t("profile.title")}
          subtitle={t("profile.subtitle")}
        />

        {loading ? (
          <LoadingState label={t("profile.loading")} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            {/* Jump bar: the profile is long, so each part is one tap away. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.jumpBar}
            >
              {SECTIONS.map((s) => (
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  onPress={() => jumpTo(s.key)}
                  style={({ pressed }) => [styles.jumpChip, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name={s.icon} size={15} color={theme.colors.text} />
                  <Text style={styles.jumpChipText}>{t(s.labelKey)}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.group} onLayout={markSection("you")}>
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
                    {email ?? t("profile.signed_in")}
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
                    <Text style={styles.heroActionText}>{t("profile.change_photo.label_short")}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.statsRow}>
                {[
                  { n: stylesSel.size, label: t("profile.stats.styles") },
                  { n: colorsSel.size, label: t("profile.stats.colors") },
                  { n: sizesSel.size, label: t("profile.stats.sizes") },
                  { n: occasionsSel.size, label: t("profile.stats.occasions") },
                ].map((s) => (
                  <View key={s.label} style={styles.stat}>
                    <Text style={styles.statNumber}>{s.n}</Text>
                    <Text style={styles.statLabel} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <SectionLabel text={t("profile.photo_check.label")} />
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
                      {photoCheck.ok ? t("profile.photo_check.passed") : t("profile.photo_check.failed")}
                    </Text>
                  </View>
                  <Text style={styles.checkText}>
                    {photoCheck.ok
                      ? t("profile.photo_check.detail", {
                          confidence: Math.round((photoCheck.personConfidence ?? 0) * 100),
                          faceKeypoints: photoCheck.faceKeypoints,
                          keypointsVisible: photoCheck.keypointsVisible,
                        })
                      : photoCheckReason(photoCheck.reason, t)}
                  </Text>
                </>
              ) : (
                <Text style={styles.checkText}>
                  {t("profile.photo_check.desc")}
                </Text>
              )}
              {photoCheck ? (
                <Text style={styles.checkMeta}>
                  {t("profile.photo_check.meta", { time: formatClock(photoCheck.checkedAt) })}
                </Text>
              ) : null}
              <AppButton
                label={photoCheck ? t("profile.photo_check.run_again") : t("profile.photo_check.run")}
                icon="scan-outline"
                variant="secondary"
                size="md"
                loading={checkingPhoto}
                onPress={() => void runPhotoCheck()}
              />
            </View>

            <SectionLabel text={t("profile.personal_details.label")} />
            <View style={styles.card}>
              <View style={[styles.nameRow, condensed && styles.nameRowStacked]}>
                <View style={styles.nameField}>
                  <Text style={styles.fieldLabel}>{t("profile.first_name")}</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={firstName}
                    onChangeText={(text) => {
                      setFirstName(text);
                      markDirty();
                    }}
                    placeholder={t("profile.first_name.placeholder")}
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={40}
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.nameField}>
                  <Text style={styles.fieldLabel}>{t("profile.last_name")}</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={lastName}
                    onChangeText={(text) => {
                      setLastName(text);
                      markDirty();
                    }}
                    placeholder={t("profile.last_name.placeholder")}
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={40}
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.genderGroup}>
                <Text style={styles.fieldLabel}>{t("profile.shop_for")}</Text>
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
                          {t(`profile.gender.${g}` as TranslationKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
            </View>

            {/* Preferences */}
            <View style={styles.group} onLayout={markSection("style")}>
            <SectionLabel text={t("profile.style.label")} />
            <View style={styles.card}>
              <PrefGroup
                label={t("profile.style.styles")}
                options={STYLES}
                selected={stylesSel}
                onToggle={(k) => {
                  setStylesSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label={t("profile.style.colors")}
                options={COLORS}
                selected={colorsSel}
                onToggle={(k) => {
                  setColorsSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label={t("profile.style.sizes")}
                options={SIZES}
                selected={sizesSel}
                onToggle={(k) => {
                  setSizesSel((s) => toggle(s, k));
                  markDirty();
                }}
              />
              <PrefGroup
                label={t("profile.style.occasions")}
                options={Array.from(OCCASIONS)}
                selected={occasionsSel}
                onToggle={(k) => {
                  setOccasionsSel((s) => toggle(s, k));
                  markDirty();
                }}
                translatePrefix="occasion"
              />
              <PrefGroup
                label={t("profile.style.categories")}
                options={Array.from(CATALOG_CATEGORIES)}
                selected={categoriesSel}
                onToggle={(k) => {
                  setCategoriesSel((s) => toggle(s, k));
                  markDirty();
                }}
                translatePrefix="category"
              />
            </View>

            <AppButton
              label={t("profile.save_preferences")}
              loading={saving}
              disabled={!dirty && !firstName.trim() && !lastName.trim()}
              onPress={save}
            />
            </View>

            <View style={styles.group} onLayout={markSection("settings")}>
            {/* AI service status (real /health probe) */}
            <SectionLabel text={t("profile.ai_service.label")} />
            <View style={styles.card}>
              {checking ? (
                <View style={styles.serviceRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.serviceText}>{t("profile.ai_service.checking")}</Text>
                </View>
              ) : health?.ok ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void checkHealth()}
                  style={styles.serviceRow}
                >
                  <View style={[styles.serviceDot, styles.serviceDotOk]} />
                  <View style={styles.serviceBody}>
                    <Text style={styles.serviceTitle}>{t("profile.ai_service.connected")}</Text>
                    <Text style={styles.serviceText}>
                      {health.modelLoaded
                        ? t("profile.ai_service.ready")
                        : t("profile.ai_service.warming")}
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
                    <Text style={styles.serviceTitle}>{t("profile.ai_service.unavailable")}</Text>
                    <Text style={styles.serviceText}>
                      {health?.message ?? t("profile.ai_service.hint")}
                    </Text>
                  </View>
                  <Text style={styles.serviceRetry}>{t("profile.ai_service.retry")}</Text>
                </Pressable>
              )}
            </View>

            {/* Settings — Profile is the settings hub */}
            <SettingsSection />
            </View>

            <View style={styles.group} onLayout={markSection("privacy")}>
            {/* Privacy & legal */}
            <SectionLabel text={t("profile.privacy.label")} />
            <View style={styles.card}>
              <LinkRow
                icon="shield-checkmark-outline"
                label={t("profile.privacy.data")}
                hint={t("profile.privacy.data.hint")}
                onPress={() => router.push("/privacy/data")}
              />
              <LinkRow
                icon="document-text-outline"
                label={t("profile.privacy.policy")}
                onPress={() => router.push("/privacy/policy")}
              />
              <LinkRow
                icon="receipt-outline"
                label={t("profile.privacy.terms")}
                onPress={() => router.push("/privacy/terms")}
              />
            </View>

            {/* Closet shortcut */}
            <SectionLabel text={t("profile.quick_actions.label")} />
            <View style={styles.card}>
              <LinkRow
                icon="shirt-outline"
                label={t("profile.quick_actions.add_clothes")}
                onPress={openCapture}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              style={styles.signOut}
              onPress={signOut}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
              <Text style={styles.signOutText}>{t("profile.sign_out")}</Text>
            </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ text }: { text: string }) {
  const styles = useStyles();
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
  translatePrefix,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  translatePrefix?: string;
}) {
  const styles = useStyles();
  const { tl } = useT();
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
                {translatePrefix ? tl(translatePrefix, opt) : opt}
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
  const styles = useStyles();
  const theme = useAppTheme();
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

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 24 },
  group: { gap: 12 },
  jumpBar: { gap: 8, paddingRight: 16 },
  jumpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  jumpChipText: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  statsRow: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.onPrimarySubtle,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statNumber: { fontSize: 20, fontWeight: "800", color: theme.colors.onPrimary },
  statLabel: { fontSize: 11.5, fontWeight: "600", color: theme.colors.onPrimaryMuted },
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
    backgroundColor: theme.colors.onPrimaryFaint,
  },
  heroBlobA: { width: 200, height: 200, top: -90, right: -60 },
  heroBlobB: {
    width: 130,
    height: 130,
    bottom: -70,
    left: -40,
    backgroundColor: theme.colors.onPrimaryFaint,
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
    backgroundColor: theme.colors.onPrimarySubtle,
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
    color: theme.colors.onPrimaryMuted,
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
  prefChipTextActive: { color: theme.colors.onPrimary },
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
}));