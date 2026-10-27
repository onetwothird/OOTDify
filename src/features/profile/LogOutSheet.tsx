// C:\OOTDify\src\features\profile\LogOutSheet.tsx
// "Log out?" confirmation, shared by Home's back button, the profile photo
// sheet and Settings. Penggi waves goodbye once as it opens (the only motion,
// skipped with reduce motion), the account being left is shown so there is no
// doubt which one it is, and staying signed in is the prominent, safe choice.
// Logging out lands on the sign-in screen from every entry point.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";

import { AppButton } from "../../shared/components/AppButton";
import { Mascot } from "../../shared/components/Mascot";
import { Sheet } from "../../shared/components/Sheet";
import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useT } from "../../shared/i18n/useT";
import { withAuthRedirectHeld } from "../../shared/lib/authRedirectHold";
import { supabase } from "../../shared/lib/supabase";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useAvatarStore } from "./avatarStore";
import { ProfileAvatar } from "./ProfileAvatar";

const PENGGI = 104;

export function LogOutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const reduceMotion = useReduceMotion();
  const avatarRef = useAvatarStore((s) => s.ref);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wave] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data.session?.user?.email ?? null);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  // One goodbye wave: tilt right, left, right, settle.
  useEffect(() => {
    if (!visible || reduceMotion) return;
    wave.setValue(0);
    const anim = Animated.timing(wave, {
      toValue: 1,
      duration: 1100,
      delay: 220,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, reduceMotion, wave]);

  const logOut = () => {
    if (busy) return;
    setBusy(true);
    // Straight to sign-in; the hold keeps the root gate from also pushing the
    // landing page on the signed-out session.
    void withAuthRedirectHeld(async () => {
      try {
        await supabase.auth.signOut();
        onClose();
        router.replace("/login");
      } finally {
        setBusy(false);
      }
    });
  };

  const rotate = wave.interpolate({
    inputRange: [0, 0.2, 0.45, 0.7, 1],
    outputRange: ["0deg", "9deg", "-7deg", "5deg", "0deg"],
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      busy={busy}
      icon="log-out-outline"
      title={t("auth.exit.title")}
      scroll={false}
      footer={
        <View style={styles.actions}>
          <AppButton label={t("auth.exit.stay")} onPress={onClose} disabled={busy} />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={logOut}
            style={({ pressed }) => [styles.logOutBtn, (pressed || busy) && styles.dim]}
          >
            <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.logOutText}>{t("auth.exit.confirm")}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <Animated.View style={[styles.penggi, { transform: [{ rotate }] }]}>
          <Mascot size={PENGGI} />
        </Animated.View>
        <Text style={styles.message}>{t("auth.exit.message")}</Text>

        {email ? (
          <View style={styles.account}>
            <ProfileAvatar size={36} initial={(email[0] ?? "?").toUpperCase()} avatarRef={avatarRef} />
            <View style={styles.accountText}>
              <Text style={styles.accountLabel}>{t("auth.exit.signed_in_as")}</Text>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {email}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  body: { alignItems: "center", gap: 14, paddingTop: 4 },
  // Pivot near Penggi's feet so the wave reads as a lean, not a spin.
  penggi: { width: PENGGI, height: PENGGI, transformOrigin: "50% 90%" },
  message: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  account: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  accountText: { flex: 1, minWidth: 0 },
  accountLabel: { fontSize: 12, fontWeight: "500", color: theme.colors.textMuted },
  accountEmail: { fontSize: 14.5, fontWeight: "600", color: theme.colors.text, marginTop: 1 },
  actions: { gap: 10 },
  logOutBtn: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  logOutText: { fontSize: 15, fontWeight: "600", color: theme.colors.danger },
  dim: { opacity: 0.6 },
}));
