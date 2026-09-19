import { router } from "expo-router";
import {
    Image,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

const ILLUSTRATION_MAX = 300;

export default function LandingScreen() {
  const { width, height } = useWindowDimensions();

  // Scale the illustration to the viewport so it never overflows small
  // screens, while capping it on large ones.
  const illustrationSize = Math.min(
    Math.min(width, height) * 0.55,
    ILLUSTRATION_MAX
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
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
            style={[
              styles.illustration,
              { width: illustrationSize, height: illustrationSize },
            ]}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
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
    textAlign: "center",
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
    minHeight: 160,
  },
  illustration: {
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
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: "#18181B",
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
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#18181B",
  },
  secondaryButtonText: {
    color: "#18181B",
    fontSize: 16,
    fontWeight: "700",
  },
});