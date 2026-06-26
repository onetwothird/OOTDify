import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme'; 

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#18181B', 
        tabBarInactiveTintColor: '#A1A1AA', 
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 4,
        },
        tabBarStyle: {
          position: 'absolute', 
          backgroundColor: '#FFFFFF', 
          borderTopWidth: 0,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          height: Platform.OS === 'ios' ? 100 : 90,
          paddingBottom: Platform.OS === 'ios' ? 30 : 15,
          paddingTop: 15, 
          elevation: 10,
          shadowColor: '#000',
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
          title: 'Home', 
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ) 
        }} 
      />

      {/* 2. AI Outfits Tab */}
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'AI Outfits', 
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "shirt" : "shirt-outline"} size={24} color={color} />
          ) 
        }} 
      />
      
      {/* 3. THE BLACK (+) FAB */}
      <Tabs.Screen
        name="create-trigger"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.centerButtonWrapper}>
              <TouchableOpacity 
                style={styles.centerButton} 
                activeOpacity={0.8}
                onPress={(e) => {
                  e.preventDefault(); 
                  console.log("Center FAB Pressed! Open your modal here.");
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
          title: 'Calendar', 
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
          ) 
        }} 
      />
      
      {/* 5. Closet Tab */}
      <Tabs.Screen 
        name="wardrobe" 
        options={{ 
          title: 'Closet', 
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="hanger" size={26} color={color} />
          ) 
        }} 
      />

    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerButtonWrapper: {
    // This dramatically negative value pushes the button halfway out of the tab bar
    top: -50, 
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    elevation: 10,
  },
  centerButton: {
    width: 75, 
    height: 75,
    borderRadius: 36, 
    backgroundColor: '#18181B', 
    justifyContent: 'center',
    alignItems: 'center',
    
    // THE CUTOUT ILLUSION:
    // This border acts as an eraser, carving a curve into the white tab bar below it.
    // It dynamically uses your theme background color to look completely invisible.
    borderWidth: 8,
    borderColor: theme.colors.background, 
  }
});