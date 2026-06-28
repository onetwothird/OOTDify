import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { theme } from '../../constants/theme';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';

const occasions = ['Casual', 'Work', 'Dinner', 'Evening', 'Formal', 'Workout'];

export default function PlannerScreen() {
  const [selectedOccasion, setSelectedOccasion] = useState('Casual');
  
  // Format today's date for initial load (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlanForDate(selectedDate);
  }, [selectedDate]);

  const fetchPlanForDate = async (date: string) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('itinerary_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('scheduled_date', date)
      .single(); 

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching plan:", error.message);
    } else {
      setDailyPlan(data);
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.logo}>My Calendar</Text>
        <TouchableOpacity><Ionicons name="menu-outline" size={28} /></TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        {occasions.map((o) => (
          <TouchableOpacity key={o} onPress={() => setSelectedOccasion(o)} style={styles.tab}>
            <Text style={[styles.tabText, selectedOccasion === o && styles.activeTabText]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Calendar
        current={selectedDate}
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

      <View style={styles.itinerarySection}>
        {loading ? (
           <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : dailyPlan ? (
          <>
            <View style={styles.itineraryHeader}>
              <Text style={styles.dateTitle}>
                {dailyPlan.occasion} • {dailyPlan.city || 'Local'}
              </Text>
              <TouchableOpacity><Text style={styles.editText}>Edit <Ionicons name="pencil" size={12} /></Text></TouchableOpacity>
            </View>
            
            {/* You can map out actual linked outfit items here eventually */}
            <View style={styles.outfitPreviewRow}>
              {['T-Shirt', 'Pants', 'Jacket'].map((item, i) => (
                <View key={i} style={styles.outfitItem}>
                  <Text style={styles.placeholderText}>{item}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No outfit planned for this date.</Text>
          </View>
        )}
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
  dateTitle: { fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
  editText: { color: '#A1A1AA', fontSize: 13 },
  outfitPreviewRow: { flexDirection: 'row', gap: 10 },
  outfitItem: { width: 100, height: 140, backgroundColor: '#F4F4F5', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  emptyState: { paddingVertical: 20, alignItems: 'center' },
  emptyStateText: { color: '#A1A1AA', fontSize: 14, fontWeight: '500' }
});