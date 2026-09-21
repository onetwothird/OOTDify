// C:\OOTDify\src\app\privacy\policy.tsx
// In-app Privacy Policy. Written to be accurate and specific: we never claim
// "100% secure", we disclose the AI backend, third-party processing and the
// storage model truthfully.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "react-native";

import { theme } from "../../shared/config/theme";

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Privacy Policy</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: September 21, 2026</Text>

        <Section title="1. The short version">
          <P>
            OOTDify uses your photos, body measurements and preferences only to
            run the features you ask for: wardrobe storage, body analysis,
            virtual try-on and outfit recommendations. We do not sell or rent
            your personal data.
          </P>
        </Section>

        <Section title="2. What we collect">
          <P>
            Account details (email, display name), wardrobe items you add,
            body photos you scan, try-on jobs and their generated images, saved
            outfits, favorites and recently-viewed items, and the style
            preferences you set.
          </P>
        </Section>

        <Section title="3. How photos are used">
          <P>
            Body photos you upload are sent to our AI backend for person
            detection, pose estimation and segmentation. Temporary files are
            deleted after each job. Photos are stored in a private bucket that
            only your account can access, and appear only in your own Screens.
          </P>
        </Section>

        <Section title="4. AI processing">
          <P>
            Body analysis and virtual try-on run on servers operated by us or
            our processors. If a third-party AI service is ever used to process
            your photos, this policy will be updated to name it before it
            processes anything.
          </P>
        </Section>

        <Section title="5. Storage & security">
          <P>
            Your data is stored with our database and object-storage provider.
            Files in private buckets are accessed through short-lived signed
            URLs. We apply access controls, but no system is completely
            secure — we work to reduce risk rather than promise that
            "nothing can ever go wrong".
          </P>
        </Section>

        <Section title="6. Your rights">
          <P>
            You can view and delete body photos, download your data, edit your
            profile and delete your account from the Privacy & Data screen.
            Deleting your account removes your data from our servers.
          </P>
        </Section>

        <Section title="7. Data retention">
          <P>
            We keep your data while your account is active. Temporary AI
            artifacts are removed after processing. After you delete your
            account, data is removed from active storage.
          </P>
        </Section>

        <Section title="8. Contact">
          <P>
            Questions about this policy? Use the account email associated with
            this app to reach out to our privacy contact.
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