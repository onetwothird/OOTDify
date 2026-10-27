import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, BackHandler, Easing, Platform, View } from "react-native";
import CaptureClothesModal from "../../features/capture/CaptureClothesModal";
import { LogOutSheet } from "../../features/profile/LogOutSheet";
import { usePresenceHeartbeat } from "../../features/community/usePresenceHeartbeat";
import { CreateMenu } from "../../features/capture/CreateMenu";
import { useAvatarStore } from "../../features/profile/avatarStore";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useTabChromeStore } from "../../shared/navigation/scrollChrome";
import { TAB_BAR_CONTENT, useTabBarHeight } from "../../shared/navigation/useTabChrome";

// Gap between the tab bar and the floating Create (+) button.
const FAB_GAP = 16;

export default function TabLayout() {
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const barHeight = useTabBarHeight();
  // Signed in and in the app: let friends see the green dot.
  usePresenceHeartbeat();
  const bottomInset = barHeight - TAB_BAR_CONTENT - 6;

  // The tab bar (and the floating Create stack with it) slides away while a
  // tab's list scrolls down and returns on scroll up, at the top, or on any
  // tab change. Screens report scrolling through useHideOnScroll().
  const chromeHidden = useTabChromeStore((s) => s.hidden);
  const setChromeHidden = useTabChromeStore((s) => s.setHidden);
  const reduceMotion = useReduceMotion();
  const [slide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) {
      slide.setValue(chromeHidden ? 1 : 0);
      return;
    }
    const anim = Animated.timing(slide, {
      toValue: chromeHidden ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [chromeHidden, slide, reduceMotion]);
  const slideDown = slide.interpolate({ inputRange: [0, 1], outputRange: [0, barHeight + 2] });

  // Back on Home would drop the user out of the signed-in app (onto the blank
  // boot route still underneath, or out of the app). Ask whether they mean to
  // log out instead. Other tabs keep the normal back-to-Home behaviour, and
  // screens pushed over the tabs (item, profile page…) have their own paths.
  // `router.canGoBack()` can't decide this: the boot route below the tabs
  // makes it true even on Home.
  const pathname = usePathname();
  const [logOutOpen, setLogOutOpen] = useState(false);
  useEffect(() => {
    setChromeHidden(false);
  }, [pathname, setChromeHidden]);
  useEffect(() => {
    if (pathname !== "/home") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setLogOutOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [pathname]);
  // Same colors as tabBarActive/InactiveTintColor below. Derived here because
  // SDK 58 types the tab bar's `color` as ColorValue (string | number | null),
  // which Ionicons' `color` prop does not accept.
  const tint = (focused: boolean) => (focused ? theme.colors.brand : theme.colors.textMuted);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: theme.colors.brand,
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
            height: barHeight,
            // Floats over the screen so it can slide away; screens pad their
            // content with useTabBarSpace() to clear it.
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            transform: [{ translateY: slideDown }],
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
        {/* Create opens from the floating (+), not the menu. */}
        <Tabs.Screen name="scan" options={{ href: null }} />
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
        <Tabs.Screen
          name="me"
          options={{
            title: t("tab.profile"),
            tabBarIcon: ({ focused }) => <TabAvatar focused={focused} />,
          }}
        />
      </Tabs>

      {/* Hidden on Create itself, where it would only lead back to the same screen. */}
      {pathname !== "/scan" ? (
        <CreateMenu bottom={barHeight + FAB_GAP} slide={slideDown} />
      ) : null}

      {/* Capture modal is mounted once here so any tab can open it. */}
      <LogOutSheet visible={logOutOpen} onClose={() => setLogOutOpen(false)} />
      <CaptureClothesModal />
    </>
  );
}

/** The user's own photo as the Profile tab icon, ringed when active. */
function TabAvatar({ focused }: { focused: boolean }) {
  const theme = useAppTheme();
  const styles = useStyles();
  const avatarRef = useAvatarStore((s) => s.ref);
  if (!avatarRef) {
    return (
      <Ionicons
        name={focused ? "person-circle" : "person-circle-outline"}
        size={26}
        color={focused ? theme.colors.brand : theme.colors.textMuted}
      />
    );
  }
  return (
    <View style={[styles.avatarRing, focused && styles.avatarRingActive]}>
      <ProfileAvatar size={22} initial="" avatarRef={avatarRef} />
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  tabLabel: { fontSize: 10, fontWeight: "500", marginTop: 2 },
  avatarRing: {
    padding: 1.5,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  avatarRingActive: { borderColor: theme.colors.brand },

}));