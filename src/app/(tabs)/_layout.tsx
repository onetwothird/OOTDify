import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, BackHandler, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CaptureClothesModal from "../../features/capture/CaptureClothesModal";
import { withAuthRedirectHeld } from "../../shared/lib/authRedirectHold";
import { supabase } from "../../shared/lib/supabase";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";

// Icon (24) + label + gaps; the Create pill (30 tall + 2 margin) fits inside.
const TAB_BAR_CONTENT = 52;

export default function TabLayout() {
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Phones without a home indicator still get a little breathing room.
  const bottomInset = Math.max(insets.bottom, 8);

  // Back on Home would drop the user out of the signed-in app (onto the blank
  // boot route still underneath, or out of the app). Ask whether they mean to
  // log out instead. Other tabs keep the normal back-to-Home behaviour, and
  // screens pushed over the tabs (item, profile page…) have their own paths.
  // `router.canGoBack()` can't decide this: the boot route below the tabs
  // makes it true even on Home.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/home") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      Alert.alert(t("auth.exit.title"), t("auth.exit.message"), [
        { text: t("auth.exit.stay"), style: "cancel" },
        {
          text: t("auth.exit.confirm"),
          style: "destructive",
          onPress: () => {
            // Straight to sign-in; the hold keeps the root gate from also
            // pushing the landing page on the signed-out session.
            void withAuthRedirectHeld(async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            });
          },
        },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [pathname, router, t]);
  // Same colors as tabBarActive/InactiveTintColor below. Derived here because
  // SDK 58 types the tab bar's `color` as ColorValue (string | number | null),
  // which Ionicons' `color` prop does not accept.
  const tint = (focused: boolean) => (focused ? theme.colors.primary : theme.colors.textMuted);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
          // Sized from the real bottom inset so icons and labels sit above the
          // iPhone home indicator instead of being squeezed into it (the extra
          // top padding otherwise comes out of the default height).
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 0.5,
            borderTopColor: theme.colors.border,
            paddingTop: 6,
            paddingBottom: bottomInset,
            height: TAB_BAR_CONTENT + 6 + bottomInset,
            ...Platform.select({
              android: { elevation: 12 },
              ios: undefined,
            }),
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: t("tab.home"),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={tint(focused)} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: t("tab.wardrobe"),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? "shirt" : "shirt-outline"} size={24} color={tint(focused)} />
            ),
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: t("tab.create"),
            tabBarIcon: ({ focused }) => (
              <View style={[styles.createPill, focused && styles.createPillActive]}>
                <Ionicons name="add" size={24} color={theme.colors.onPrimary} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="outfits"
          options={{
            title: t("tab.outfits"),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? "grid" : "grid-outline"} size={24} color={tint(focused)} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: t("tab.community"),
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={24}
                color={tint(focused)}
              />
            ),
          }}
        />
        {/* Profile is settings — reachable from the Home avatar, not the menu. */}
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>

      {/* Capture modal is mounted once here so any tab can open it. */}
      <CaptureClothesModal />
    </>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  tabLabel: { fontSize: 10, fontWeight: "500", marginTop: 2 },
  createPill: {
    width: 46,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  createPillActive: {
    transform: [{ scale: 1.06 }],
  },
}));