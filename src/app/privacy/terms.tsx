// C:\OOTDify\src\app\privacy\terms.tsx
// In-app Terms of Service — honest, readable and specific to how the app and
// its AI backend behave today (including the try-on integration boundary).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../shared/config/theme";

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Terms of Service</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: September 21, 2026</Text>

        <Section title="1. The service">
          <P>
            OOTDify helps you catalogue clothes, scan your body for AI analysis,
            try on catalog garments virtually and build outfits. Features are
            driven by real data in our system and by the AI backend we operate.
          </P>
        </Section>

        <Section title="2. Being honest about AI">
          <P>
            Body analysis (pose + segmentation) is performed by YOLO models on
            our servers. Virtual try-on is a separate AI service. If that
            service isn't configured, try-on jobs fail with an honest error
            rather than showing generated images. We never substitute mocked or
            placeholder results for real ones.
          </P>
        </Section>

        <Section title="3. Your content">
          <P>
            You keep ownership of the photos you upload. Setting up an account
            and using features grants us the limited right to store and process
            that content to run the service for you (storage, analysis,
            try-on, recommendations).
          </P>
        </Section>

        <Section title="4. Acceptable use">
          <P>
            Don't upload photos of other people without their permission, don't
            use the service to harass or misidentify anyone, and don't attempt
            to access other users' data.
          </P>
        </Section>

        <Section title="5. Availability">
          <P>
            We aim to keep the service available, but we may pause or retire
            features (including AI features) as the product evolves. Core
            privacy controls — viewing, exporting and deleting your data —
            will keep working while your account exists.
          </P>
        </Section>

        <Section title="6. Liability">
          <P>
            The service is provided "as is" without warranties of any kind.
            AI results may be imperfect; we are not liable for decisions based
            on recommendations, and virtual try-on is a preview, not a promise.
          </P>
        </Section>

        <Section title="7. Termination">
          <P>
            You can delete your account at any time from Privacy & Data. We may
            suspend accounts that violate these terms or abuse the backend.
          </P>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  content: { padding: 16, paddingBottom: 48 },
  updated: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 16 },
  section: { marginBottom: 18 },
  h: { fontSize: 15, fontWeight: "800", color: theme.colors.text, marginBottom: 6 },
  p: { fontSize: 13.5, color: theme.colors.text, lineHeight: 20 },
});