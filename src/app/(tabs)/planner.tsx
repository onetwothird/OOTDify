// src/app/(tabs)/planner.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PlannerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendar</Text>
      <Text style={styles.subtitle}>Your scheduled outfit itineraries.</Text>
      
      <View style={styles.emptyState}>
        <Ionicons name="calendar-outline" size={56} color={theme.colors.border} style={{ marginBottom: 16 }} />
        <Text style={styles.emptyStateText}>No upcoming plans.</Text>
        <Text style={styles.emptyStateSubtext}>Create an itinerary to see it here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: theme.colors.textMuted, marginBottom: 32, marginTop: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  emptyStateText: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  emptyStateSubtext: { color: theme.colors.textMuted, fontSize: 14, marginTop: 6 },
});