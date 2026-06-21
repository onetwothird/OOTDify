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
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarStyle: {
          position: 'absolute', 
          backgroundColor: theme.colors.surface, // Pure White
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: Platform.OS === 'ios' ? 90 : 75,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },
      }}
    >
      <Tabs.Screen 
        name="home" 
        options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} /> }} 
      />
      <Tabs.Screen 
        name="index" 
        options={{ title: 'AI Outfits', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "shirt" : "shirt-outline"} size={24} color={color} /> }} 
      />
      
      {/* --- THE BLACK (+) FAB --- */}
      <Tabs.Screen
        name="create-trigger"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.centerButtonWrapper}>
              <TouchableOpacity style={styles.centerButton} activeOpacity={0.8}>
                <Ionicons name="add" size={28} color="#FFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <Tabs.Screen 
        name="planner" 
        options={{ title: 'Calendar', tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons name={focused ? "calendar-blank" : "calendar-blank-outline"} size={24} color={color} /> }} 
      />
       <Tabs.Screen 
        name="wardrobe" 
        options={{ title: 'Closet', tabBarIcon: ({ color }) => <MaterialCommunityIcons name="hanger" size={26} color={color} /> }} 
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerButtonWrapper: {
    top: -22, // Pushes the button up so it breaks out of the tab bar
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary, // The Black button
    justifyContent: 'center',
    alignItems: 'center',
    
    // THE CUTOUT ILLUSION:
    // This matches the background of your app (#F4F4F4), acting as a mask over the white tab bar
    borderWidth: 6,
    borderColor: theme.colors.background, 
  }
});