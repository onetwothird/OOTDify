// C:\OOTDify\src\features\profile\LogOutSheet.tsx
// "Log out?" confirmation, shared by Home's back button, the profile photo
// sheet and Settings. The account being left is shown so there is no doubt
// which one it is, and staying signed in is the prominent, safe choice.
// Logging out covers the app with Penggi's farewell (crying on a white
// screen) and lands on the landing page ("Dress well, effortlessly.")
// underneath it from every entry point.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AppButton } from "../../shared/components/AppButton";
import { penggi } from "../../shared/components/PenggiMoment";
import { Sheet } from "../../shared/components/Sheet";
import { useT } from "../../shared/i18n/useT";
import { withAuthRedirectHeld } from "../../shared/lib/authRedirectHold";
import { supabase } from "../../shared/lib/supabase";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { unregisterPush } from "../notifications/service";
import { useAvatarStore } from "./avatarStore";
import { ProfileAvatar } from "./ProfileAvatar";

// The modal's fade-out, then the farewell's white fade-in.
const SHEET_GONE_MS = 320;
const FAREWELL_COVERED_MS = 260;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function LogOutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const avatarRef = useAvatarStore((s) => s.ref);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const logOut = () => {
    if (busy) return;
    setBusy(true);
    // The sheet is a native modal, which draws above everything, so it goes
    // away first; then the farewell covers the app and the switch to the
    // landing page happens out of sight behind it.
    onClose();
    // The hold keeps the root gate from also redirecting on the signed-out
    // session while we navigate ourselves.
    void withAuthRedirectHeld(async () => {
      try {
        await wait(SHEET_GONE_MS);
        penggi.show("farewell", t("penggi.farewell.title"), t("penggi.farewell.message"));
        await wait(FAREWELL_COVERED_MS);
        // This phone stops getting the account's notifications first.
        await unregisterPush().catch(() => {});
        await supabase.auth.signOut();
        router.replace("/(auth)");
      } finally {
        setBusy(false);
      }
    });
  };

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
