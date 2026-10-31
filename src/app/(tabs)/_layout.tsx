import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, BackHandler, Easing, Platform, View } from "react-native";
import CaptureClothesModal from "../../features/capture/CaptureClothesModal";
import { LogOutSheet } from "../../features/profile/LogOutSheet";
import { usePresenceHeartbeat } from "../../features/community/usePresenceHeartbeat";
import { NotificationsHost } from "../../features/notifications/NotificationsHost";
import { CreateMenu, CreateTabButton } from "../../features/capture/CreateMenu";
import { useCreateMenuStore } from "../../features/capture/createMenuStore";
import { useAvatarStore } from "../../features/profile/avatarStore";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { loadProfilePage } from "../../features/profile/profileData";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useTabChromeStore } from "../../shared/navigation/scrollChrome";
import { TAB_BAR_CONTENT, useTabBarHeight } from "../../shared/navigation/useTabChrome";

// Gap between the tab bar and the Create menu that floats above it.
const FLOAT_GAP = 12;
// Long enough for Home's own requests to go first.
const PROFILE_PRELOAD_MS = 1500;

export default function TabLayout() {
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const barHeight = useTabBarHeight();
  // Signed in and in the app: let friends see the green dot.
  usePresenceHeartbeat();
  // Preload the Profile tab once Home has had its turn, so it opens filled in.
  useEffect(() => {
    const id = setTimeout(() => void loadProfilePage().catch(() => {}), PROFILE_PRELOAD_MS);
    return () => clearTimeout(id);
  }, []);
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
  const menuOpen = useCreateMenuStore((s) => s.open);
  const closeMenu = useCreateMenuStore((s) => s.close);
  useEffect(() => {
    setChromeHidden(false);
    closeMenu();
  }, [pathname, setChromeHidden, closeMenu]);
  // An open Create menu is a layer over the page; back closes it first.
  useEffect(() => {
    if (!menuOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeMenu();
      return true;
    });
    return () => sub.remove();
  }, [menuOpen, closeMenu]);
  useEffect(() => {
    if (pathname !== "/home" || menuOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setLogOutOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [pathname, menuOpen]);
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
          name="wardrobe"
          options={{
            title: t("tab.wardrobe"),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? "shirt" : "shirt-outline"} size={24} color={tint(focused)} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: t("tab.discover"),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? "compass" : "compass-outline"} size={24} color={tint(focused)} />
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
        {/* The (+), last in the bar, after Profile. Its bar item opens the Create menu instead of
            switching tabs; the try-on screen behind it opens from that menu.
            It is not `href: null`: SDK 58 turns that into `hidden`, and a
            hidden tab that gets focus is redirected to Home. */}
        <Tabs.Screen
          name="scan"
          options={{
            title: t("tab.create"),
            tabBarButton: (props) => <CreateTabButton style={props.style} />,
          }}
        />
      </Tabs>

      <CreateMenu bottom={barHeight + FLOAT_GAP} slide={slideDown} />

      {/* Capture modal is mounted once here so any tab can open it. */}
      <NotificationsHost />
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