// C:\OOTDify\src\app\(tabs)\_layout.tsx
// Five tabs: Home · Wardrobe · Create (AI) · Outfits · Profile.
// The central Create tab carries stronger visual emphasis (raised pill).
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import CaptureClothesModal from "../../features/capture/CaptureClothesModal";
import { theme } from "../../shared/config/theme";

export default function TabLayout() {
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
            borderTopWidth: StyleSheet.hairlineWidth,
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
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: "Wardrobe",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "shirt" : "shirt-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: "Create",
            tabBarIcon: ({ focused }) => (
              <View style={[styles.createPill, focused && styles.createPillActive]}>
                <Ionicons name="sparkles" size={21} color="#FFF" />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="outfits"
          options={{
            title: "Outfits",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "grid" : "grid-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Capture modal is mounted once here so any tab can open it. */}
      <CaptureClothesModal />
    </>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  createPill: {
    width: 46,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    // Slight lift so the AI action stands out from the other tabs.
    marginBottom: 2,
  },
  createPillActive: {
    // Deeper ink + small scale handled by the sibling label highlight.
    backgroundColor: theme.colors.accent,
    transform: [{ scale: 1.06 }],
  },
});