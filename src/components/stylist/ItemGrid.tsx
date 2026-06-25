import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ClothingItem } from '../../types';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface ItemGridProps {
  items: ClothingItem[];
  onSelectItem?: (item: ClothingItem) => void;
  selectable?: boolean;
  selectedIds?: string[];
}

export function ItemGrid({ items, onSelectItem, selectable = false, selectedIds = [] }: ItemGridProps) {
  return (
    <View style={styles.gridContainer}>
      {items.map((item) => {
        const isSelected = selectedIds.includes(item.id);
        
        return (
          <TouchableOpacity 
            key={item.id} 
            style={[styles.itemCard, isSelected && styles.itemCardSelected]}
            onPress={() => onSelectItem && onSelectItem(item)}
            activeOpacity={selectable ? 0.7 : 1}
            disabled={!selectable}
          >
            <View style={styles.imageContainer}>
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
              {selectable && isSelected && (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                </View>
              )}
            </View>
            <Text style={styles.vibeText} numberOfLines={1}>{item.vibe}</Text>
            <Text style={styles.categoryText}>{item.category}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemCard: {
    width: '48%',
    marginBottom: 16,
  },
  itemCardSelected: {
    opacity: 0.8,
  },
  imageContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 160,
    borderRadius: theme.borderRadius.sm,
    resizeMode: 'cover',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  vibeText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  categoryText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});