import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import CaptureClothesModal from "../../features/capture/CaptureClothesModal";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";

export default function TabLayout() {
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
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
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 0.5,
            borderTopColor: theme.colors.border,
            paddingTop: 6,
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