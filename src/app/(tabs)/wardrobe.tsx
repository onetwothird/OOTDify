import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { supabase } from '../../../lib/supabase';

const filters = ['All', 'Headwear', 'Tops', 'Outerwear', 'Bottoms'];

export default function WardrobeScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [wardrobeItems, setWardrobeItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWardrobe();
  }, []);

  const fetchWardrobe = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clothing_items')
      .select('*');

    if (error) {
      console.error("Error fetching clothes:", error.message);
    } else {
      setWardrobeItems(data || []);
    }
    setLoading(false);
  };

  // Optional: Filter items based on the active tab
  const filteredItems = activeFilter === 'All' 
    ? wardrobeItems 
    : wardrobeItems.filter(item => item.category.toLowerCase() === activeFilter.toLowerCase());

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

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredItems}
          numColumns={2}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingBottom: 120 }} 
          ListEmptyComponent={<Text style={styles.emptyText}>No items found in your wardrobe.</Text>}
          renderItem={({ item }) => (
            <View style={styles.cardContainer}>
              <Image source={{ uri: item.image_url }} style={styles.cardImage} />
              <View style={styles.cardFooter}>
                <Text style={styles.cardTitle}>{item.category}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.vibe || 'Any'}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: '#18181B' },
  addButton: { backgroundColor: '#18181B', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F5', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#18181B' },
  filterWrapper: { marginBottom: 24 },
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterPill: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24 },
  activeFilterPill: { backgroundColor: '#18181B' },
  inactiveFilterPill: { backgroundColor: '#F4F4F5' },
  filterText: { fontSize: 14, fontWeight: '600' },
  activeFilterText: { color: '#FFFFFF' },
  inactiveFilterText: { color: '#71717A' },
  row: { justifyContent: 'space-between', marginBottom: 24 },
  cardContainer: { width: '48%' },
  cardImage: { width: '100%', height: 140, borderRadius: 16, backgroundColor: '#F4F4F5', resizeMode: 'cover', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#18181B', textTransform: 'capitalize' },
  badge: { backgroundColor: '#F4F4F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#71717A' },
  emptyText: { textAlign: 'center', color: '#71717A', marginTop: 40, fontSize: 15 }
});