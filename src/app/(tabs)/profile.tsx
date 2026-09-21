// C:\OOTDify\src\app\(tabs)\profile.tsx
// Profile: identity + fashion preferences (real, persisted via the Flask
// backend /api/profile), plus links to Privacy & Data controls and sign out.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { OCCASIONS } from "../../features/clothing/types";
import { Button } from "../../shared/components/Button";
import { ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { theme } from "../../shared/config/theme";
import { supabase } from "../../shared/lib/supabase";
import {
  checkBackendHealth,
  getProfile,
  updateProfile,
  UserProfile,
} from "../../services/aiApi";
import type { HealthResult } from "../../services/aiApi";

const STYLES = ["Minimal", "Streetwear", "Classic", "Sporty", "Smart casual", "Vintage", "Edgy"];
const COLORS = ["Black", "White", "Neutral", "Pastel", "Bold", "Earthy"];
const SIZES = ["XS", "S", "M", "L", "XL"];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openCapture = useCaptureModalStore((s) => s.open);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [stylesSel, setStylesSel] = useState<Set<string>>(new Set());
  const [colorsSel, setColorsSel] = useState<Set<string>>(new Set());
  const [occasionsSel, setOccasionsSel] = useState<Set<string>>(new Set());
  const [sizesSel, setSizesSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ---- AI backend /health probe --------------------------------------------
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(true);
  const checkHealth = useCallback(async () => {
    setChecking(true);
    const result = await checkBackendHealth();
    setHealth(result);
    setChecking(false);
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { profile: p, email: mail } = await getProfile();
      setProfile(p);
      setEmail(mail);
      setDisplayName(p.display_name ?? "");
      setStylesSel(new Set(p.preferred_styles ?? []));
      setColorsSel(new Set(p.preferred_colors ?? []));
      setOccasionsSel(new Set(p.preferred_occasions ?? []));
      setSizesSel(new Set(p.sizes ?? []));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      const updated = await updateProfile({
        display_name: displayName.trim() || null,
        preferred_styles: Array.from(stylesSel),
        preferred_colors: Array.from(colorsSel),
        preferred_occasions: Array.from(occasionsSel),
        sizes: Array.from(sizesSel),
      });
      setProfile(updated);
      setDirty(false);
      Alert.alert("Profile updated", "Your preferences now shape recommendations.");
    } catch (e) {
      Alert.alert(
        "Could not save",
        e instanceof Error ? e.message : "Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    void supabase.auth.signOut();
  };

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
            {/* Identity */}
            <View style={styles.card}>
              <View style={styles.avatarRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(displayName || email || "?")
                      .trim()
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.identity}>
                  <TextInput
                    style={styles.nameInput}
                    value={displayName}
                    onChangeText={(t) => {
                      setDisplayName(t);
                      markDirty();
                    }}
                    placeholder="Your display name"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={40}
                  />
                  <Text style={styles.email} numberOfLines={1}>
                    {email ?? "Signed in"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Preferences */}
            <Text style={styles.sectionLabel}>YOUR STYLE</Text>
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
            </View>

            <Button
              title="Save preferences"
              loading={saving}
              disabled={!dirty && !displayName.trim()}
              onPress={save}
            />

            {/* AI service status (real /health probe) */}
            <Text style={styles.sectionLabel}>AI SERVICE</Text>
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

            {/* Privacy & legal */}
            <Text style={styles.sectionLabel}>PRIVACY & DATA</Text>
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
              <Ionicons name="log-out-outline" size={18} color="#B45309" />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 14,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  identity: { flex: 1, minWidth: 0 },
  nameInput: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.text,
    paddingVertical: 4,
  },
  email: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },
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
  signOutText: { color: "#B45309", fontWeight: "700", fontSize: 15 },
});