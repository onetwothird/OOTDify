// C:\OOTDify\src\app\onboarding.tsx
// First-run prompt after signup: one screen asking for a nickname and a few
// style preferences, so the very first recommendations aren't generic. Shown
// once — home.tsx routes here only while the local, email-tagged flag from
// features/profile/onboarding is set; saving or skipping clears it.
//
// Real data only: the nickname field is prefilled from the actual profile
// (GET /api/profile) and everything saved goes through PATCH /api/profile —
// the same endpoint the Profile tab uses. If the AI service is unreachable
// the screen says so and still lets the user through; nothing is faked.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
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

import { OCCASIONS } from "../features/clothing/types";
import { clearOnboardingPending } from "../features/profile/onboarding";
import { AppButton } from "../shared/components/AppButton";
import { ErrorState } from "../shared/components/StateViews";
import { LoadingState } from "../shared/components/LoadingState";
import { theme } from "../shared/config/theme";
import { toast } from "../shared/lib/toast";
import { getProfile, updateProfile } from "../services/aiApi";

// Same option lists as the Profile tab (kept local there too) — the two
// screens must offer identical choices, since both persist to one profile.
const STYLES = ["Minimal", "Streetwear", "Classic", "Sporty", "Smart casual", "Vintage", "Edgy"];
const COLORS = ["Black", "White", "Neutral", "Pastel", "Bold", "Earthy"];

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [stylesSel, setStylesSel] = useState<Set<string>>(new Set());
  const [colorsSel, setColorsSel] = useState<Set<string>>(new Set());
  const [occasionsSel, setOccasionsSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Prefill from the real profile — the field starts honest, not empty.
  const load = useCallback(async () => {
    try {
      const { profile } = await getProfile();
      setNickname(profile.display_name ?? profile.first_name ?? "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { profile } = await getProfile();
        if (cancelled) return;
        setNickname(profile.display_name ?? profile.first_name ?? "");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Could not load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Leave the screen either way: the flag clears so this never loops, and the
  // user lands back home where the app actually lives.
  const finish = useCallback(
    async (goHome: () => void) => {
      await clearOnboardingPending();
      goHome();
    },
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const name = nickname.trim();
      await updateProfile({
        display_name: name || null,
        preferred_styles: Array.from(stylesSel),
        preferred_colors: Array.from(colorsSel),
        preferred_occasions: Array.from(occasionsSel),
      });
      toast.success("All set", "Your picks now shape what OOTDify suggests.");
      await finish(() => router.replace("/(tabs)/home"));
    } catch (e) {
      toast.error(
        "Couldn't save yet",
        `${e instanceof Error ? e.message : "Please try again."} You can set these in Profile anytime.`,
      );
    } finally {
      setSaving(false);
    }
  }, [nickname, stylesSel, colorsSel, occasionsSel, finish, router]);

  const skip = useCallback(() => {
    void finish(() => router.replace("/(tabs)/home"));
  }, [finish, router]);

  const busy = saving;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Welcome head — what this is and why it's worth ten seconds. */}
          <View style={styles.head}>
            <View style={styles.headBadge}>
              <Ionicons name="sparkles" size={18} color={theme.colors.onPrimary} />
            </View>
            <Text style={styles.headTitle}>Make it yours</Text>
            <Text style={styles.headSubtitle}>
              Tell Fitguin a little about your taste — the first suggestions will already feel
              like yours. This takes about ten seconds.
            </Text>
          </View>

          {loading ? (
            <LoadingState label="Loading your profile" />
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => { setLoading(true); setLoadError(null); void load(); }} />
          ) : (
            <View style={styles.card}>
              {/* Nickname — what the app calls you (home greeting, posts, chat). */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>WHAT SHOULD WE CALL YOU?</Text>
                <TextInput
                  style={styles.input}
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="Your nickname"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={40}
                  autoCorrect={false}
                  editable={!busy}
                />
              </View>

              <PrefGroup
                label="STYLES YOU LIKE"
                hint="Pick any that feel like you."
                options={STYLES}
                selected={stylesSel}
                onToggle={(k) => setStylesSel((s) => toggle(s, k))}
              />
              <PrefGroup
                label="FAVOURITE COLOURS"
                options={COLORS}
                selected={colorsSel}
                onToggle={(k) => setColorsSel((s) => toggle(s, k))}
              />
              <PrefGroup
                label="OCCASIONS"
                hint="Where do you dress up for?"
                options={OCCASIONS}
                selected={occasionsSel}
                onToggle={(k) => setOccasionsSel((s) => toggle(s, k))}
              />

              <AppButton
                label="Save and continue"
                onPress={() => void save()}
                loading={saving}
                disabled={busy}
                style={styles.saveBtn}
              />
              <Pressable
                accessibilityRole="button"
                onPress={skip}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => [styles.skipRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.skipText}>Maybe later — I&apos;ll set this up in Profile</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View style={{ paddingBottom: Math.max(insets.bottom, theme.spacing.md) }} />
      </KeyboardAvoidingView>
    </View>
  );
}

function PrefGroup({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <View style={styles.prefGroup}>
      <Text style={styles.prefLabel}>{label}</Text>
      {hint ? <Text style={styles.prefHint}>{hint}</Text> : null}
      <View style={styles.prefChips}>
        {options.map((opt) => {
          const active = selected.has(opt);
          return (
            <Pressable
              key={opt}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.page,
    paddingBottom: theme.spacing.lg,
    gap: 16,
  },

  // Welcome head
  head: { alignItems: "center", gap: 8, paddingTop: 8 },
  headBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  headTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: theme.colors.text,
  },
  headSubtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
  },

  card: {
    gap: 18,
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },

  // Nickname field
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
  },
  input: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceAlt,
  },

  // Preference chip groups (same visual language as the Profile tab)
  prefGroup: { gap: 8 },
  prefLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
  },
  prefHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: -4 },
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

  saveBtn: { marginTop: 2 },
  skipRow: { alignItems: "center", paddingVertical: 6 },
  skipText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
});
