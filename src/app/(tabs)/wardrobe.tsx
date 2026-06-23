// src/app/(tabs)/wardrobe.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Alert } from 'react-native';
import { useWardrobeStore } from '../../store/wardrobeStore';
import { theme } from '../../constants/theme';
import { Ionicons, Feather } from '@expo/vector-icons'; // <-- Added Feather here

export default function ClosetScreen() {
  const { items, outfits } = useWardrobeStore();
  const [activeTab, setActiveTab] = useState('Outfits');
  
  // 1. New State for Grid Columns
  const [numColumns, setNumColumns] = useState(2);

  const displayData: any[] = activeTab === 'Items' ? items : outfits;

  // 2. Action Handlers for the 3 buttons
  const toggleGrid = () => {
    // Switches between 1 and 2 columns
    setNumColumns((prev) => (prev === 2 ? 1 : 2)); 
  };

  const openFilters = () => {
    Alert.alert("Filters", "The filter drawer will open here.");
  };

  const openSort = () => {
    Alert.alert("Sort", "The sorting options will open here.");
  };

  return (
    <View style={styles.container}>
      {/* --- TOP BRANDING ROW --- */}
      <View style={styles.topNav}>
        <Text style={styles.logoText}>OOTDify</Text>
        <TouchableOpacity>
          <Ionicons name="menu-outline" size={28} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* --- SUB TABS --- */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'Items' && styles.activeTabButton]} 
          onPress={() => setActiveTab('Items')}
        >
          <Text style={[styles.tabText, activeTab === 'Items' && styles.activeTabText]}>Items</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'Outfits' && styles.activeTabButton]} 
          onPress={() => setActiveTab('Outfits')}
        >
          <Text style={[styles.tabText, activeTab === 'Outfits' && styles.activeTabText]}>Outfits</Text>
        </TouchableOpacity>
      </View>

      {/* --- STATS & FILTER ROW --- */}
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          Closet includes {displayData.length} {activeTab.toLowerCase()}
        </Text>
        
        {/* 3. The Working Buttons! */}
        <View style={styles.filterIcons}>
          <TouchableOpacity style={styles.iconBtn} onPress={toggleGrid}>
            <Feather 
              name={numColumns === 2 ? "grid" : "square"} // Changes icon based on state
              size={20} 
              color={theme.colors.text} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.iconBtn} onPress={openFilters}>
            <Feather name="sliders" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.iconBtn} onPress={openSort}>
            <Feather name="git-commit" size={20} color={theme.colors.text} style={{ transform: [{ rotate: '90deg' }] }} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* --- GRID --- */}
      <FlatList
        data={displayData}
        // Critical: React Native requires the key to change when numColumns changes on the fly
        key={numColumns} 
        numColumns={numColumns}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={numColumns === 2 ? styles.row : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }} 
        renderItem={({ item }: { item: any }) => (
          <TouchableOpacity 
            // Dynamically change width based on column count
            style={[styles.itemCard, { width: numColumns === 2 ? '48%' : '100%', marginBottom: numColumns === 1 ? 16 : 0 }]} 
            activeOpacity={0.9}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.image} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme.colors.background, 
    paddingHorizontal: theme.spacing.lg, 
    paddingTop: 60 
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E4E4E7',
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: 'transparent',
  },
  activeTabButton: {
    borderColor: theme.colors.text,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  activeTabText: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statsText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  filterIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    padding: 2,
  },
  row: { 
    justifyContent: 'space-between', 
    marginBottom: 16 
  },
  itemCard: { 
    backgroundColor: '#F4F4F5', 
    borderRadius: 16,
    height: 220,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: { 
    width: '100%', 
    height: '100%', 
    resizeMode: 'contain' 
  },
});