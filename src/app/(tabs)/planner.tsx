import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, Image } from 'react-native';
import { theme } from '../../constants/theme';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';

const occasions = ['Casual', 'Work', 'Dinner', 'Evening', 'Formal', 'Workout'];

export default function PlannerScreen() {
  const [selectedOccasion, setSelectedOccasion] = useState('Casual');
  const [selectedDate, setSelectedDate] = useState('2026-02-10');

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* --- BRANDING --- */}
      <View style={styles.header}>
        <Text style={styles.logo}>OOTDify</Text>
        <TouchableOpacity><Ionicons name="menu-outline" size={28} /></TouchableOpacity>
      </View>

      {/* --- OCCASION TABS --- */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        {occasions.map((o) => (
          <TouchableOpacity key={o} onPress={() => setSelectedOccasion(o)} style={styles.tab}>
            <Text style={[styles.tabText, selectedOccasion === o && styles.activeTabText]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* --- CALENDAR --- */}
      <Calendar
        current={'2026-02-01'}
        theme={{
          backgroundColor: 'transparent',
          calendarBackground: 'transparent',
          textSectionTitleColor: '#A1A1AA',
          selectedDayBackgroundColor: '#18181B',
          todayTextColor: '#18181B',
          arrowColor: '#18181B',
        }}
        onDayPress={(day: { dateString: React.SetStateAction<string>; }) => setSelectedDate(day.dateString)}
        markedDates={{
          [selectedDate]: { selected: true, selectedColor: '#18181B' }
        }}
      />

      {/* --- ITINERARY PREVIEW --- */}
      <View style={styles.itinerarySection}>
        <View style={styles.itineraryHeader}>
          <Text style={styles.dateTitle}>Mon, Jan 5th - New Work</Text>
          <TouchableOpacity><Text style={styles.editText}>Edit <Ionicons name="pencil" size={12} /></Text></TouchableOpacity>
        </View>
        
        <View style={styles.outfitPreviewRow}>
          {['T-Shirt', 'Pants', 'Jacket'].map((item, i) => (
            <View key={i} style={styles.outfitItem} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  logo: { fontSize: 32, fontWeight: '900' },
  tabsRow: { marginBottom: 20 },
  tab: { marginRight: 20 },
  tabText: { fontSize: 15, color: '#A1A1AA', fontWeight: '500' },
  activeTabText: { color: '#000', fontWeight: '700', borderBottomWidth: 2, borderBottomColor: '#000' },
  itinerarySection: { marginTop: 30, paddingBottom: 120 },
  itineraryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  dateTitle: { fontSize: 16, fontWeight: '700' },
  editText: { color: '#A1A1AA', fontSize: 13 },
  outfitPreviewRow: { flexDirection: 'row', gap: 10 },
  outfitItem: { width: 100, height: 140, backgroundColor: '#F4F4F5', borderRadius: 12 }
});