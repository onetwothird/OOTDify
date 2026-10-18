// C:\OOTDify\src\app\privacy\terms.tsx
// In-app Terms of Service — honest, readable and specific to how the app and
// its AI backend behave today (including the try-on integration boundary).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../shared/config/theme";
import { TERMS_DISPLAY_DATE, TERMS_VERSION } from "../../shared/config/legal";

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
        <Text style={styles.updated}>
          Version {TERMS_VERSION} — last updated: {TERMS_DISPLAY_DATE}
        </Text>

        <Section title="1. The service">
          <P>
            OOTDify helps you catalogue clothes, scan your body for AI analysis,
            try on catalog garments virtually and build outfits. Features are
            driven by real data in our system and by the AI backend we operate.
          </P>
        </Section>

        <Section title="2. Who can use OOTDify">
          <P>
            You need an account (email or Google sign-in) and must be old enough
            to consent to these terms in your jurisdiction — if you are under 18,
            use the app only with a parent or guardian&apos;s permission. One
            person per account: you are responsible for your credentials and for
            anything that happens under your account.
          </P>
        </Section>

        <Section title="3. Being honest about AI">
          <P>
            Body analysis (pose + segmentation) is performed by YOLO models on
            our servers. Virtual try-on is a separate AI service. If that
            service isn&apos;t configured, try-on jobs fail with an honest error
            rather than showing generated images. We never substitute mocked or
            placeholder results for real ones.
          </P>
          <P>
            AI output is approximate and can be wrong. Body measurements,
            detections, recommendations and try-on previews are inputs for your
            own judgement — not medical, sizing or fashion advice you should
            rely on blindly.
          </P>
        </Section>

        <Section title="4. Your content">
          <P>
            You keep ownership of the photos you upload. Setting up an account
            and using features grants us the limited right to store and process
            that content to run the service for you (storage, analysis,
            try-on, recommendations). See the Privacy Policy for exactly what is
            collected, where it is stored and which processors handle it.
          </P>
        </Section>

        <Section title="5. Acceptable use">
          <P>
            Don&apos;t upload photos of other people without their permission,
            don&apos;t use the service to harass or misidentify anyone, and
            don&apos;t attempt to access other users&apos; data. Don&apos;t
            abuse the API, probe for vulnerabilities, or use automated traffic
            against the backend. Violations may suspend the account.
          </P>
        </Section>

        <Section title="6. Features and limitations">
          <P>
            OOTDify ships what actually works today: wardrobe catalogue,
            catalog browsing, recommendations from the real catalog, style
            calendar, body scan analysis and virtual try-on. Some integrations
            are explicitly unfinished (for example, in-app AI chat is not yet
            available, and shopping-platform import is planned, not shipped).
            Roadmap items are not obligations to deliver.
          </P>
        </Section>

        <Section title="7. Shopping and affiliate disclosure">
          <P>
            OOTDify does not sell garments and processes no marketplace orders
            or payments. Catalog items may link or refer to third-party sources
            (such as Unsplash images) for inspiration only. If we ever add
            affiliate or sponsored links, they will be labelled as such inside
            the app before use — no hidden monetisation of your outfit data.
          </P>
        </Section>

        <Section title="8. Availability">
          <P>
            We aim to keep the service available, but we may pause or retire
            features (including AI features) as the product evolves. Core
            privacy controls — viewing, exporting and deleting your data —
            will keep working while your account exists.
          </P>
        </Section>

        <Section title="9. Liability">
          <P>
            The service is provided &ldquo;as is&rdquo; without warranties of any kind.
            AI results may be imperfect; we are not liable for decisions based
            on recommendations, and virtual try-on is a preview, not a promise.
            To the extent permitted by law, our total liability is limited to
            the amount you paid us in the last 12 months (currently zero, since
            the app is free).
          </P>
        </Section>

        <Section title="10. Changes to these terms">
          <P>
            When these terms change materially we bump the version shown above
            and ask you to accept again from the app before AI features
            continue. Continuing to use the app after accepting a new version
            means you accept it.
          </P>
        </Section>

        <Section title="11. Termination">
          <P>
            You can delete your account at any time from Privacy & Data. We may
            suspend accounts that violate these terms or abuse the backend.
          </P>
        </Section>

        <Section title="12. Governing law">
          <P>
            These terms are governed by the laws of the Republic of the
            Philippines, including the Data Privacy Act of 2012 (RA 10173),
            without regard to conflict-of-law rules.
          </P>
        </Section>

        <Text style={styles.reviewFlag}>
          Note for the owner: this document was drafted to describe the
          app&apos;s actual behaviour and should be reviewed by qualified legal
          counsel before commercial launch.
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