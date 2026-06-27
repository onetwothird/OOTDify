import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

export default function HomeScreen() {
  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }} 
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Morning, Third!</Text>
        <TouchableOpacity>
          <Ionicons name="notifications-outline" size={24} color="#18181B" />
        </TouchableOpacity>
      </View>

      <View style={styles.scheduleCard}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateDay}>FRI</Text>
          <Text style={styles.dateNumber}>12</Text>
        </View>
        
        <View style={styles.scheduleInfo}>
          <Text style={styles.scheduleTitle}>Meet-up with Steve</Text>
          <Text style={styles.scheduleTime}>Today at 1:00 pm</Text>
        </View>

        <View style={styles.weatherInfo}>
          <Ionicons name="partly-sunny" size={20} color="#A1A1AA" />
          <Text style={styles.weatherTemp}>64°F</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today's Pick</Text>
        <TouchableOpacity style={styles.restyleBtn}>
          <Text style={styles.restyleText}>Restyle </Text>
          <Ionicons name="sparkles" size={14} color="#A855F7" />
        </TouchableOpacity>
      </View>

      <View style={styles.mainCard}>
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1516826957135-700ede19c6ce?auto=format&fit=crop&w=800&q=80' }} 
          style={styles.cardImage} 
        />
        
        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterTitle}>Friday Brunch Fit</Text>
          <TouchableOpacity style={styles.bookmarkBtn}>
            <Ionicons name="bookmark-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    paddingHorizontal: 20, 
    paddingTop: 70
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 32,
    fontWeight: '900',
    color: '#18181B',
  },
  scheduleCard: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F5',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  dateBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dateDay: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3F3F46',
    marginBottom: 2,
  },
  dateNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#18181B',
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 13,
    color: '#71717A',
    fontWeight: '500',
  },
  weatherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherTemp: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    marginLeft: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  restyleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  restyleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A855F7', 
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F4F4F5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 5,
  },
  cardImage: {
    width: '100%',
    height: 340,
    borderRadius: 16,
    resizeMode: 'cover',
    marginBottom: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  cardFooterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  bookmarkBtn: {
    backgroundColor: '#18181B', 
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});