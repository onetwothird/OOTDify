import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import CaptureClothesModal from "../../features/capture/CaptureClothesModal";
import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { theme } from "../../shared/config/theme";

export default function TabLayout() {
  const openCapture = useCaptureModalStore((s) => s.open);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: "#18181B",
          tabBarInactiveTintColor: "#A1A1AA",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            marginTop: 4,
          },
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "#FFFFFF",
            borderTopWidth: 0,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            height: Platform.OS === "ios" ? 100 : 90,
            paddingBottom: Platform.OS === "ios" ? 30 : 15,
            paddingTop: 15,
            elevation: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            paddingHorizontal: 15,
          },
        }}
      >
        {/* 1. Home Tab */}
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />

        {/* 2. AI Outfits Tab */}
        <Tabs.Screen
          name="index"
          options={{
            title: "AI Outfits",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "shirt" : "shirt-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />

        {/* 3. THE BLACK (+) FAB - opens the capture-clothes flow */}
        <Tabs.Screen
          name="create-trigger"
          options={{
            title: "",
            tabBarButton: () => (
              <View style={styles.centerButtonWrapper}>
                <TouchableOpacity
                  style={styles.centerButton}
                  activeOpacity={0.8}
                  onPress={(e) => {
                    e.preventDefault();
                    openCapture();
                  }}
                >
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ),
          }}
        />

        {/* 4. Calendar Tab */}
        <Tabs.Screen
          name="planner"
          options={{
            title: "Calendar",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />

        {/* 5. Wardrobe Tab */}
        <Tabs.Screen
          name="wardrobe"
          options={{
            title: "Wardrobe",
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="hanger" size={26} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Rendered once here so it can be opened from anywhere:
          the FAB above, or the Wardrobe screen's own + button. */}
      <CaptureClothesModal />
    </>
  );
}

const styles = StyleSheet.create({
  centerButtonWrapper: {
    top: -50,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    elevation: 20,
  },
  centerButton: {
    width: 80,
    height: 80,
    borderRadius: 42,
    backgroundColor: "#18181B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 8,
    borderColor: theme.colors.background,
  },
});