// src/app/(tabs)/home.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>Good Morning,</Text>
      <Text style={styles.title}>Thirdy</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Conditions</Text>
        <Text style={styles.cardText}>Sunny, 32°C. Perfect for breathable, light layers.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Style Insights</Text>
        <Text style={styles.cardText}>Your wardrobe is leaning heavily into casual essentials. Generating an evening look might require adding new items.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, paddingTop: 60 },
  greeting: { fontSize: 16, color: theme.colors.textMuted, fontWeight: '600' },
  title: { fontSize: 32, fontWeight: '800', color: theme.colors.text, marginBottom: 32, letterSpacing: -0.5 },
  card: { backgroundColor: theme.colors.surface, padding: 20, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  cardText: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 22 },
});