// src/app/(tabs)/wardrobe.tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { useWardrobeStore } from '../../store/wardrobeStore';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ClosetScreen() {
  const { items } = useWardrobeStore();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Closet</Text>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="search-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={styles.imageContainer}>
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
            </View>
            <Text style={styles.vibeText}>{item.vibe}</Text>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5 },
  iconButton: { padding: 8, backgroundColor: theme.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border },
  row: { justifyContent: 'space-between', marginBottom: 16 },
  itemCard: { width: '48%' },
  imageContainer: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: 8, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8 },
  image: { width: '100%', height: 160, borderRadius: theme.borderRadius.sm, resizeMode: 'cover' },
  vibeText: { color: theme.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  categoryText: { color: theme.colors.textMuted, fontSize: 11, textTransform: 'uppercase', fontWeight: '600' },
});