import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase'; 

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

 const handleSignup = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!agreed) {
      Alert.alert('Terms', 'Please agree to the Terms and Conditions');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });

    if (error) {
      Alert.alert('Signup Failed', error.message);
    } else {
      // Signs the user out instantly so they don't bypass login
      await supabase.auth.signOut(); 
      
      // Routes them to the index landing page!
      Alert.alert('Success!', 'Your account has been created.', [
        { text: 'OK', onPress: () => router.replace('/(auth)') } 
      ]);
    }
  };

  const handleGoogleAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) Alert.alert('Google Auth Error', error.message);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#18181B" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Create Your Account</Text>
        <Text style={styles.subtitle}>Best Way to Manage{'\n'}Your Fits.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Full Name*</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter Full Name"
              placeholderTextColor="#A1A1AA"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <Text style={styles.label}>Email Address*</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter Your Email"
              placeholderTextColor="#A1A1AA"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.label}>Password*</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter Your Password"
              placeholderTextColor="#A1A1AA"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.termsRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.8}>
            <Ionicons name={agreed ? "radio-button-on" : "radio-button-off"} size={20} color={agreed ? "#A855F7" : "#A1A1AA"} />
            <Text style={styles.termsText}>
              I agree with the <Text style={styles.termsLink}>Terms and Conditions</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Sign Up</Text>}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Or Continue With</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialButton}>
              <Ionicons name="logo-google" size={20} color="#EA4335" />
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton}>
              <Ionicons name="logo-apple" size={20} color="#18181B" />
              <Text style={styles.socialButtonText}>Apple</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/login')}>
          <Text style={styles.footerLink}>Log In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  backButton: { width: 40, height: 40, backgroundColor: '#F4F4F5', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', color: '#18181B', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#A1A1AA', textAlign: 'center', marginBottom: 40, fontWeight: '500' },
  form: { gap: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#18181B', marginBottom: -8, zIndex: 1, marginLeft: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F5', borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E4E4E7' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#18181B', fontWeight: '500' },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 },
  termsText: { fontSize: 13, color: '#71717A', fontWeight: '500' },
  termsLink: { color: '#A855F7', fontWeight: '700', textDecorationLine: 'underline' },
  primaryButton: { backgroundColor: '#18181B', height: 56, borderRadius: 100, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: '#E4E4E7' },
  dividerText: { marginHorizontal: 16, color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  socialRow: { flexDirection: 'row', gap: 16 },
  socialButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, backgroundColor: '#FFFFFF', borderRadius: 100, borderWidth: 1, borderColor: '#E4E4E7', gap: 8 },
  socialButtonText: { fontSize: 14, fontWeight: '600', color: '#18181B' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 40 : 24, backgroundColor: '#FFF' },
  footerText: { fontSize: 14, color: '#71717A', fontWeight: '500' },
  footerLink: { fontSize: 14, color: '#A855F7', fontWeight: '700' },
});