import { router } from "expo-router";
import {
    Image,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function LandingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Header Section */}
        <View style={styles.header}>
          <Text style={styles.title}>Get Started!</Text>
          <Text style={styles.subtitle}>
            Best Way to Manage{"\n"}Your Fits.
          </Text>
        </View>

        {/* 3D Illustration Section */}
        <View style={styles.imageContainer}>
          {/* TODO: Replace this URI with your actual local 3D asset, e.g., require('../../../assets/images/3d-wallet.png') */}
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80",
            }}
            style={styles.illustration}
          />
        </View>

        {/* Pagination Dots */}
        <View style={styles.pagination}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        {/* Bottom Actions Section */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/signup")}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/login")}
            activeOpacity={0.5}
          >
            <Text style={styles.secondaryButtonText}>Log In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingTop: Platform.OS === "android" ? 40 : 20,
    paddingBottom: 20,
  },
  header: {
    alignItems: "center",
    marginTop: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#18181B",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#A1A1AA",
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 24,
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  illustration: {
    width: 280,
    height: 280,
    resizeMode: "contain",
    borderRadius: 20, // Only needed for the Unsplash placeholder
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F4F4F5",
  },
  activeDot: {
    width: 24,
    backgroundColor: "#A855F7", // The purple accent from your other screens
  },
  footer: {
    paddingBottom: 10,
  },
  primaryButton: {
    backgroundColor: "#18181B",
    height: 60,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    height: 60,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#18181B",
  },
  secondaryButtonText: {
    color: "#18181B",
    fontSize: 16,
    fontWeight: "700",
  },
});
