// C:\OOTDify\src\app\profile\edit.tsx
// Edit profile — identity, photo check and fashion preferences only (real,
// persisted via the Flask backend /api/profile). Device settings, privacy and
// sign out live on the Settings screen. Pushed over the tabs from the profile
// page's "Edit profile" button, so back returns to the profile.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATALOG_CATEGORIES, OCCASIONS } from "../../features/clothing/types";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { captureSelfie } from "../../features/profile/avatar";
import { AvatarSourceSheet } from "../../features/profile/AvatarSourceSheet";
import { useAvatarStore } from "../../features/profile/avatarStore";
import { clampNickname, namesFromMetadata, NICKNAME_MAX } from "../../features/profile/names";
import { supabase } from "../../shared/lib/supabase";
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
import { toast } from "../../shared/lib/toast";
import { notePenggi } from "../../features/home/penggiNotes";
import {
  checkProfilePhoto,
  getProfile,
  updateProfile,
} from "../../services/aiApi";

const STYLES = ["Minimal", "Streetwear", "Classic", "Sporty", "Smart casual", "Vintage", "Edgy"];
const COLORS = ["Black", "White", "Neutral", "Pastel", "Bold", "Earthy"];
const SIZES = ["XS", "S", "M", "L", "XL"];
const GENDERS = ["men", "women", "unisex"] as const;

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
  const { width } = useWindowDimensions();
  const condensed = width < 380;


  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  // Shared so the home header shows a change the moment it happens.
  const avatarRef = useAvatarStore((s) => s.ref);
  const setAvatarRef = useAvatarStore((s) => s.setRef);
  const photoCheck = useAvatarStore((s) => s.check);
  const setPhotoCheck = useAvatarStore((s) => s.setCheck);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [gender, setGender] = useState("");
  const [stylesSel, setStylesSel] = useState<Set<string>>(new Set());
  const [colorsSel, setColorsSel] = useState<Set<string>>(new Set());
  const [occasionsSel, setOccasionsSel] = useState<Set<string>>(new Set());
  const [sizesSel, setSizesSel] = useState<Set<string>>(new Set());
  const [categoriesSel, setCategoriesSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Core loader — effect-safe (no synchronous setState); state starts as loading.
  const fetchProfile = useCallback(async () => {
    try {
      const [{ profile: p, email: mail }, { data: auth }] = await Promise.all([
        getProfile(),
        supabase.auth.getSession(),
      ]);
      // The name given at sign-up lives on the account until it is saved here.
      const signUp = namesFromMetadata(auth.session?.user?.user_metadata);
      setEmail(mail);
      setFirstName(p.first_name || signUp.first);
      setLastName(p.last_name || signUp.last);
      setNickname(clampNickname(p.display_name || p.first_name || signUp.first));
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
      // The nickname is what the app calls you; it no longer becomes the full name.
      const nick = clampNickname(nickname) || clampNickname(f);
      await updateProfile({
        first_name: f || null,
        last_name: l || null,
        gender: gender || null,
        display_name: nick || null,
        preferred_styles: Array.from(stylesSel),
        preferred_colors: Array.from(colorsSel),
        preferred_occasions: Array.from(occasionsSel),
        preferred_categories: Array.from(categoriesSel),
        sizes: Array.from(sizesSel),
      });
      setDirty(false);
      notePenggi("profile_updated");
      toast.success(t("profile.toast.updated.title"), t("profile.toast.updated.message"));
    } catch (e) {
      toast.error(t("profile.toast.save_error.title"), e instanceof Error ? e.message : t("profile.toast.save_error.message"));
    } finally {
      setSaving(false);
    }
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
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title={t("profile.page.edit")}
          subtitle={t("profile.subtitle")}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/me"))}
          backLabel={t("settings.screen.back_a11y")}
        />

        {loading ? (
          <LoadingState label={t("profile.loading")} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <View style={styles.group}>
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
                    onPress={() => setPhotoSheetOpen(true)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.heroAction,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="camera-outline" size={13} color={theme.colors.onPrimary} />
                    <Text style={styles.heroActionText}>{t("profile.change_photo.label_short")}</Text>
                  </Pressable>
                  <AvatarSourceSheet
                    visible={photoSheetOpen}
                    onClose={() => setPhotoSheetOpen(false)}
                    onChanged={setAvatarRef}
                  />
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
              <View>
                <View style={styles.nickHead}>
                  <Text style={styles.fieldLabel}>{t("profile.nickname")}</Text>
                  <Text style={styles.counter}>
                    {Array.from(nickname).length}/{NICKNAME_MAX}
                  </Text>
                </View>
                <TextInput
                  style={styles.nameInput}
                  value={nickname}
                  onChangeText={(text) => {
                    setNickname(Array.from(text).slice(0, NICKNAME_MAX).join(""));
                    markDirty();
                  }}
                  placeholder={t("profile.nickname.placeholder")}
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={NICKNAME_MAX * 2}
                  autoCorrect={false}
                />
                <Text style={styles.fieldHint}>{t("profile.nickname.hint", { max: NICKNAME_MAX })}</Text>
              </View>
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
            <View style={styles.group}>
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

          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.sectionLabelText} accessibilityRole="header">
      {text}
    </Text>
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

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 24 },
  group: { gap: 12 },
  statsRow: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.onPrimarySubtle,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statNumber: { fontSize: 20, fontWeight: "700", color: theme.colors.onPrimary },
  statLabel: { fontSize: 11.5, fontWeight: "600", color: theme.colors.onPrimaryMuted },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    marginTop: 10,
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
    fontWeight: "600",
  },
  checkHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkDot: { width: 9, height: 9, borderRadius: 5 },
  checkDotOk: { backgroundColor: theme.colors.success },
  checkDotWarn: { backgroundColor: theme.colors.warning },
  checkTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
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
    fontWeight: "700",
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
    fontWeight: "700",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  genderGroup: { gap: 8 },
  nickHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  counter: { fontSize: 11.5, fontWeight: "600", color: theme.colors.textMuted },
  fieldHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 6 },
  nameInput: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceAlt,
  },
  prefGroup: { gap: 8 },
  prefLabel: { fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },
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
}));