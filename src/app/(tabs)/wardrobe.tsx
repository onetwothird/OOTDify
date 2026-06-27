import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

const filters = ['All', 'Headwear', 'Tops', 'Outerwear', 'Bottoms'];

const mockCategories = [
  { id: '1', title: 'Tops', count: 123, imageUrl: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=400&q=80' },
  { id: '2', title: 'Bottoms', count: 56, imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=80' },
  { id: '3', title: 'Outerwear', count: 23, imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=400&q=80' },
  { id: '4', title: 'Footwear', count: 37, imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=400&q=80' },
  { id: '5', title: 'Headwear', count: 12, imageUrl: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=400&q=80' },
  { id: '6', title: 'Dresses', count: 23, imageUrl: 'https://images.unsplash.com/photo-1515347619362-6729a99723bd?auto=format&fit=crop&w=400&q=80' },
];

export default function WardrobeScreen() {
  const [activeFilter, setActiveFilter] = useState('All');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Wardrobe</Text>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#A1A1AA" style={styles.searchIcon} />
        <TextInput 
          placeholder="What are you looking for..." 
          placeholderTextColor="#A1A1AA"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filters.map((filter) => (
            <TouchableOpacity 
              key={filter} 
              style={[
                styles.filterPill, 
                activeFilter === filter ? styles.activeFilterPill : styles.inactiveFilterPill
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[
                styles.filterText, 
                activeFilter === filter ? styles.activeFilterText : styles.inactiveFilterText
              ]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={mockCategories}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: 120 }} 
        renderItem={({ item }) => (
          <View style={styles.cardContainer}>
            <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
            <View style={styles.cardFooter}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.count}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    paddingHorizontal: 20, 
    paddingTop: 60 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#18181B',
  },
  addButton: {
    backgroundColor: '#18181B',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#18181B',
  },
  filterWrapper: {
    marginBottom: 24,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterPill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  activeFilterPill: {
    backgroundColor: '#18181B',
  },
  inactiveFilterPill: {
    backgroundColor: '#F4F4F5',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  inactiveFilterText: {
    color: '#71717A',
  },
  row: { 
    justifyContent: 'space-between', 
    marginBottom: 24 
  },
  cardContainer: {
    width: '48%',
  },
  cardImage: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    backgroundColor: '#F4F4F5',
    resizeMode: 'cover',
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    marginRight: 6,
  },
  badge: {
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
  }
});