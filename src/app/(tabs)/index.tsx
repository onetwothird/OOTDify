// src/app/(tabs)/index.tsx
import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Modal, TextInput, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

export default function AIOutfitsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [optimizePlan, setOptimizePlan] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState('Casual');

  const occasions = [
    { name: 'Casual', icon: 'shirt-outline' },
    { name: 'Work', icon: 'briefcase-outline' },
    { name: 'Dinner', icon: 'wine-outline' },
    { name: 'Evening', icon: 'moon-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* --- TOP HEADER --- */}
      <View style={styles.header}>
        <TouchableOpacity>
          <Ionicons name="menu-outline" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={styles.dateText}>Mon, Jan 5th</Text>
          <TouchableOpacity style={styles.dropdownTrigger} onPress={() => setModalVisible(true)}>
            <Text style={styles.dropdownText}>Occasion?</Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* --- SUB-HEADER ROUTE --- */}
      <TouchableOpacity style={styles.subHeaderLink} onPress={() => setModalVisible(true)}>
        <Ionicons name="apps-outline" size={18} color={theme.colors.text} style={{ marginRight: 8 }} />
        <Text style={styles.subHeaderText}>Plan Set of Outfits</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
      </TouchableOpacity>

      {/* --- OOTD COLLAGE CANVAS --- */}
      <View style={styles.canvasContainer}>
        {/* Mocked absolute items layered over one another to match the visual collage layout */}
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1520975954732-57dd22299614?q=80&w=400' }} 
          style={[styles.canvasImage, { width: 120, height: 160, top: 20, left: 20, zIndex: 2 }]} 
        />
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=400' }} 
          style={[styles.canvasImage, { width: 150, height: 220, top: 40, right: 30, zIndex: 1 }]} 
        />
        {/* Selected Highlight item (The bag feature in image_42dff6) */}
        <View style={styles.highlightedItemWrapper}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=400' }} 
            style={[styles.canvasImage, { width: 80, height: 80 }]} 
          />
        </View>
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1539185441755-769473a23570?q=80&w=400' }} 
          style={[styles.canvasImage, { width: 70, height: 70, bottom: 20, left: 40, zIndex: 2 }]} 
        />
      </View>

      {/* --- CANVAS ACTION CONTROLS --- */}
      <View style={styles.actionButtonGroup}>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Select Another</Text>
          <Ionicons name="add" size={18} color="#FFF" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Not a Match</Text>
        </TouchableOpacity>
      </View>

      {/* --- ITINERARY BOTTOM SHEET MODAL --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Grab Bar Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Outfit Itinerary Plan</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Occasions Horizontal List */}
              <Text style={styles.inputHeading}>Occasions</Text>
              <View style={styles.occasionsRow}>
                {occasions.map((o) => (
                  <TouchableOpacity 
                    key={o.name} 
                    style={[styles.occasionChip, selectedOccasion === o.name && styles.activeChip]}
                    onPress={() => setSelectedOccasion(o.name)}
                  >
                    <Ionicons name={o.icon as any} size={14} color={selectedOccasion === o.name ? '#FFF' : theme.colors.text} style={{ marginRight: 6 }} />
                    <Text style={[styles.occasionChipText, selectedOccasion === o.name && { color: '#FFF' }]}>{o.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Destination Entry fields */}
              <Text style={styles.inputHeading}>Where to?</Text>
              <View style={styles.inputRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.subLabel}>City</Text>
                  <TextInput style={styles.textInput} placeholder="New Work" placeholderTextColor="#A1A1AA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Country</Text>
                  <TextInput style={styles.textInput} placeholder="USA" placeholderTextColor="#A1A1AA" />
                </View>
              </View>

              {/* Date Selector Input */}
              <Text style={styles.inputHeading}>Select your dates</Text>
              <TouchableOpacity style={styles.pickerRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="calendar-outline" size={20} color={theme.colors.text} style={{ marginRight: 12 }} />
                  <View>
                    <Text style={styles.pickerMainText}>Plan your schedule</Text>
                    <Text style={styles.pickerSubText}>Select date</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>

              {/* Optimization Switch */}
              <View style={[styles.pickerRow, { marginTop: 16, marginBottom: 24 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="git-branch-outline" size={20} color={theme.colors.text} style={{ marginRight: 12 }} />
                  <View>
                    <Text style={styles.pickerMainText}>Optimize Plan?</Text>
                    <Text style={styles.pickerSubText}>Quick Plan</Text>
                  </View>
                </View>
                <Switch 
                  value={optimizePlan} 
                  onValueChange={setOptimizePlan}
                  trackColor={{ false: '#E4E4E7', true: theme.colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Submit Form Intent */}
              <TouchableOpacity style={styles.modalSubmitButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalSubmitText}>Create Outfit Plan</Text>
                <Ionicons name="add" size={18} color="#FFF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, marginBottom: 20 },
  headerRight: { alignItems: 'flex-end' },
  dateText: { fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dropdownText: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginRight: 4 },
  subHeaderLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface, marginHorizontal: theme.spacing.lg, padding: 14, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.border },
  subHeaderText: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.text },
  
  // Canvas Moodboard Layout
  canvasContainer: { flex: 1, marginVertical: 20, marginHorizontal: theme.spacing.lg, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  canvasImage: { position: 'absolute', borderRadius: theme.borderRadius.sm, resizeMode: 'cover' },
  highlightedItemWrapper: { position: 'absolute', top: 130, right: 40, zIndex: 3, padding: 4, borderWidth: 2, borderColor: theme.colors.accentGreen, borderRadius: theme.borderRadius.sm, backgroundColor: '#FFF' },
  
  // Outer Button Pairs
  actionButtonGroup: { paddingHorizontal: theme.spacing.lg, gap: 12, marginBottom: 30 },
  primaryButton: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: theme.borderRadius.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  secondaryButton: { backgroundColor: theme.colors.surface, paddingVertical: 16, borderRadius: theme.borderRadius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  secondaryButtonText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },

  // Modal Itinerary Sheet Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.xl, borderTopRightRadius: theme.borderRadius.xl, paddingHorizontal: theme.spacing.lg, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 24, borderBottomWidth: 1, borderColor: theme.colors.border },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  inputHeading: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 20, marginBottom: 12 },
  occasionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  occasionChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primaryMuted, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.sm },
  activeChip: { backgroundColor: theme.colors.primary },
  occasionChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  inputRow: { flexDirection: 'row' },
  subLabel: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 6, fontWeight: '500' },
  textInput: { backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.sm, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: theme.colors.text },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.primaryMuted, padding: 14, borderRadius: theme.borderRadius.md },
  pickerMainText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  pickerSubText: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  modalSubmitButton: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: theme.borderRadius.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  modalSubmitText: { color: '#FFF', fontSize: 15, fontWeight: '700' }
});