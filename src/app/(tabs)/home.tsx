import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

export default function HomeScreen() {
  const [weatherData, setWeatherData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- NEW: DYNAMIC DATE LOGIC ---
  const today = new Date();
  // Gets the short day name (e.g., "Sun", "Mon") and makes it uppercase
  const dayName = today.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  // Gets just the number of the day (e.g., "28")
  const dateNumber = today.getDate();

  useEffect(() => {
    (async () => {
      // 1. Request location permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        setIsLoading(false);
        return;
      }

      // 2. Get user's current coordinates
      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      // 3. Fetch weather from OpenWeatherMap (in Celsius)
      const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${API_KEY}`;

      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (response.ok) {
          setWeatherData(data);
        } else {
          console.error("OpenWeatherMap Error:", data.message);
          setWeatherData(null);
        }
      } catch (error) {
        console.error("Error fetching weather:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'Clear': return 'sunny';
      case 'Clouds': return 'partly-sunny';
      case 'Rain': case 'Drizzle': return 'rainy';
      case 'Thunderstorm': return 'thunderstorm';
      case 'Snow': return 'snow';
      default: return 'cloud';
    }
  };

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }} 
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Morning, Third!</Text>
          <View style={styles.locationContainer}>
            <Ionicons name="location" size={14} color="#71717A" />
            <Text style={styles.locationText}>
              {isLoading ? 'Locating...' : weatherData?.name || 'Unknown Location'}
            </Text>
          </View>
        </View>
        <TouchableOpacity>
          <Ionicons name="notifications-outline" size={24} color="#18181B" />
        </TouchableOpacity>
      </View>

      <View style={styles.scheduleCard}>
        {/* --- NEW: DYNAMIC CALENDAR BADGE --- */}
        <View style={styles.dateBadge}>
          <Text style={styles.dateDay}>{dayName}</Text>
          <Text style={styles.dateNumber}>{dateNumber}</Text>
        </View>
        
        <View style={styles.scheduleInfo}>
          <Text style={styles.scheduleTitle}>Chill Weekend Indoors</Text>
          <Text style={styles.scheduleTime}>All Day</Text>
        </View>

        <View style={styles.weatherInfo}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#A1A1AA" />
          ) : weatherData?.weather?.[0] ? (
            <>
              <Ionicons 
                name={getWeatherIcon(weatherData.weather[0].main)} 
                size={20} 
                color="#A1A1AA" 
              />
              <Text style={styles.weatherTemp}>
                {Math.round(weatherData.main.temp)}°C
              </Text>
            </>
          ) : (
            <Text style={styles.weatherTemp}>--°C</Text>
          )}
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
          source={{ uri: 'https://images.unsplash.com/photo-1584273143981-41c073dfe8f8?auto=format&fit=crop&w=800&q=80' }} 
          style={styles.cardImage} 
        />
        
        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterTitle}>Cozy Home Fit</Text>
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
    paddingTop: 50
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
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#71717A',
    fontWeight: '500',
    marginLeft: 4,
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