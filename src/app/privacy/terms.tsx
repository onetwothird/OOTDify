// C:\OOTDify\src\app\privacy\terms.tsx
// In-app Terms of Service — honest, readable and specific to how the app and
// its AI backend behave today (including the try-on integration boundary).
import { LegalDocument, type LegalSection } from "../../features/legal/LegalDocument";
import { TERMS_DISPLAY_DATE, TERMS_VERSION } from "../../shared/config/legal";
import { useT } from "../../shared/i18n/useT";

const SECTIONS: LegalSection[] = [
  { titleKey: "privacy.terms.s1.title", bodyKeys: ["privacy.terms.s1.body"] },
  { titleKey: "privacy.terms.s2.title", bodyKeys: ["privacy.terms.s2.body"] },
  { titleKey: "privacy.terms.s3.title", bodyKeys: ["privacy.terms.s3.body1", "privacy.terms.s3.body2"] },
  { titleKey: "privacy.terms.s4.title", bodyKeys: ["privacy.terms.s4.body"] },
  { titleKey: "privacy.terms.s5.title", bodyKeys: ["privacy.terms.s5.body"] },
  { titleKey: "privacy.terms.s6.title", bodyKeys: ["privacy.terms.s6.body"] },
  { titleKey: "privacy.terms.s7.title", bodyKeys: ["privacy.terms.s7.body"] },
  { titleKey: "privacy.terms.s8.title", bodyKeys: ["privacy.terms.s8.body"] },
  { titleKey: "privacy.terms.s9.title", bodyKeys: ["privacy.terms.s9.body"] },
  { titleKey: "privacy.terms.s10.title", bodyKeys: ["privacy.terms.s10.body"] },
  { titleKey: "privacy.terms.s11.title", bodyKeys: ["privacy.terms.s11.body"] },
  { titleKey: "privacy.terms.s12.title", bodyKeys: ["privacy.terms.s12.body"] },
];

export default function TermsScreen() {
  const { t } = useT();
  return (
    <LegalDocument
      title={t("profile.privacy.terms")}
      updated={t("privacy.terms.updated", { version: TERMS_VERSION, date: TERMS_DISPLAY_DATE })}
      sections={SECTIONS}
      reviewFlag={t("privacy.terms.review_flag")}
    />
  );
}
