// C:\OOTDify\src\app\privacy\policy.tsx
// In-app Privacy Policy. Written to be accurate and specific: we never claim
// "100% secure", we disclose the AI backend, third-party processing and the
// storage model truthfully.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../shared/config/theme";
import { TERMS_DISPLAY_DATE, TERMS_VERSION } from "../../shared/config/legal";

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
        <Text style={styles.updated}>
          Version {TERMS_VERSION} — last updated: {TERMS_DISPLAY_DATE}
        </Text>

        <Section title="1. The short version">
          <P>
            OOTDify uses your photos, body measurements and preferences only to
            run the features you ask for: wardrobe storage, body analysis,
            virtual try-on and outfit recommendations. We do not sell or rent
            your personal data.
          </P>
        </Section>

        <Section title="2. What we collect and why">
          <P>
            Account details (email, display name) — to create and identify your
            account. Wardrobe items you add and your style preferences — to
            power your catalog and recommendations. Body photos you scan — only
            for person detection, pose estimation, segmentation and try-on.
            Try-on jobs and their generated images, saved outfits, favorites
            and recently-viewed items — to show your history and looks. Your
            terms acceptance record (version + timestamp) — to prove consent is
            on file before AI processing, as required below.
          </P>
        </Section>

        <Section title="3. How photos are used">
          <P>
            Body photos you upload are sent to our AI backend for person
            detection, pose estimation and segmentation. Temporary files are
            deleted after each job. Photos are stored in a private bucket that
            only your account can access (row-level security + short-lived
            signed URLs), and appear only in your own screens. AI features are
            refused server-side until you have accepted the current Terms of
            Service and Privacy Policy.
          </P>
        </Section>

        <Section title="4. AI processing and processors">
          <P>
            Body analysis and virtual try-on run on servers operated by us or
            our processors. The third parties that touch your data today:
          </P>
          <P>
            &bull; Supabase — database, authentication and private file storage
            (Philippines/region cloud).{"\n"}
            &bull; Cloudinary — image delivery and signed-URL hosting for
            wardrobe/catalog images.{"\n"}
            &bull; Google — optional sign-in only (your name and email as
            provided by Google).{"\n"}
            &bull; Our own Flask AI backend — YOLO detection, pose,
            segmentation and outfit recommendation.{"\n"}
            &bull; Unsplash — source images for catalog inspiration items.
          </P>
          <P>
            Open datasets (Hugging Face / Kaggle fashion sets) were used to
            seed the public catalog — they contain no user data. If a
            third-party AI service is ever used to process your photos, this
            policy will be updated to name it before it processes anything.
          </P>
        </Section>

        <Section title="5. Storage & security">
          <P>
            Your data is stored with our database and object-storage provider.
            Files in private buckets are accessed through short-lived signed
            URLs. Backend access uses server-side keys that never ship in the
            app, and every user-scoped table is restricted to your own rows.
            We apply access controls, but no system is completely secure — we
            work to reduce risk rather than promise that
            &ldquo;nothing can ever go wrong&rdquo;.
          </P>
        </Section>

        <Section title="6. Your rights">
          <P>
            You can view and delete body photos, download your data, edit your
            profile and delete your account from the Privacy & Data screen.
            Under the Philippine Data Privacy Act of 2012 you also have the
            right to be informed, to access, to object, to rectify or erase
            data, and to data portability, and to lodge a complaint with the
            National Privacy Commission. The in-app controls cover these
            directly; anything else, contact us using the address below.
          </P>
        </Section>

        <Section title="7. Data retention">
          <P>
            We keep your data while your account is active. Temporary AI
            artifacts are removed after processing. After you delete your
            account, data is removed from active storage (backup propagation
            may take a short time). Deleting the account cannot be undone.
          </P>
        </Section>

        <Section title="8. Sharing">
          <P>
            We never sell or rent personal data. We share it only with the
            processors listed above, and only to run the service; or when
            required by law. There is no advertising SDK and no tracking
            across other apps or websites.
          </P>
        </Section>

        <Section title="9. Children">
          <P>
            OOTDify is not directed at children under 13, and we do not
            knowingly collect their data. Contact us if you believe a child has
            an account so we can remove it.
          </P>
        </Section>

        <Section title="10. Changes to this policy">
          <P>
            Material changes bump the version shown above; you will be asked to
            accept the updated Terms/Privacy in-app before AI features
            continue.
          </P>
        </Section>

        <Section title="11. Contact">
          <P>
            Questions about this policy? Use the account email associated with
            this app to reach out to our privacy contact.
          </P>
        </Section>

        <Text style={styles.reviewFlag}>
          Note for the owner: this policy describes the app&apos;s actual data
          practices and should be reviewed by qualified legal counsel (and the
          designated privacy officer, if any) before commercial launch.
        </Text>
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
  reviewFlag: {
    fontSize: 12,
    fontStyle: "italic",
    color: theme.colors.textMuted,
    lineHeight: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
});