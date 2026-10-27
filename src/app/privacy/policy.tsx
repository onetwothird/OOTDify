// C:\OOTDify\src\app\privacy\policy.tsx
// In-app Privacy Policy. Written to be accurate and specific: we never claim
// "100% secure", we disclose the AI backend, third-party processing and the
// storage model truthfully.
import { LegalDocument, type LegalSection } from "../../features/legal/LegalDocument";
import { TERMS_DISPLAY_DATE, TERMS_VERSION } from "../../shared/config/legal";
import { useT } from "../../shared/i18n/useT";

const SECTIONS: LegalSection[] = [
  { titleKey: "privacy.policy.s1.title", bodyKeys: ["privacy.policy.s1.body"] },
  { titleKey: "privacy.policy.s2.title", bodyKeys: ["privacy.policy.s2.body"] },
  { titleKey: "privacy.policy.s3.title", bodyKeys: ["privacy.policy.s3.body"] },
  { titleKey: "privacy.policy.s4.title", bodyKeys: ["privacy.policy.s4.body1", "privacy.policy.s4.body2", "privacy.policy.s4.body3"] },
  { titleKey: "privacy.policy.s5.title", bodyKeys: ["privacy.policy.s5.body"] },
  { titleKey: "privacy.policy.s6.title", bodyKeys: ["privacy.policy.s6.body"] },
  { titleKey: "privacy.policy.s7.title", bodyKeys: ["privacy.policy.s7.body"] },
  { titleKey: "privacy.policy.s8.title", bodyKeys: ["privacy.policy.s8.body"] },
  { titleKey: "privacy.policy.s9.title", bodyKeys: ["privacy.policy.s9.body"] },
  { titleKey: "privacy.policy.s10.title", bodyKeys: ["privacy.policy.s10.body"] },
  { titleKey: "privacy.policy.s11.title", bodyKeys: ["privacy.policy.s11.body"] },
];

export default function PrivacyPolicyScreen() {
  const { t } = useT();
  return (
    <LegalDocument
      title={t("settings.about.privacy")}
      updated={t("privacy.policy.updated", { version: TERMS_VERSION, date: TERMS_DISPLAY_DATE })}
      sections={SECTIONS}
      reviewFlag={t("privacy.policy.review_flag")}
    />
  );
}
