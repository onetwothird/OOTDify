// C:\OOTDify\src\features\wardrobe\WardrobeSwitcher.tsx
// The Closet | Outfits switch under the Wardrobe tab's header. Same pill
// segment as Community's switcher.
import { Pressable, Text, View } from "react-native";

import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { WardrobeSection } from "./section";

export function WardrobeSwitcher({
  section,
  onChange,
}: {
  section: WardrobeSection;
  onChange: (section: WardrobeSection) => void;
}) {
  const styles = useStyles();
  const { t } = useT();
  const options: [WardrobeSection, string][] = [
    ["closet", t("wardrobe.section.closet")],
    ["outfits", t("wardrobe.section.outfits")],
  ];
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map(([key, label]) => (
        <Pressable
          key={key}
          accessibilityRole="tab"
          accessibilityState={{ selected: section === key }}
          onPress={() => onChange(key)}
          style={[styles.btn, section === key && styles.btnActive]}
        >
          <Text style={[styles.text, section === key && styles.textActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  segment: { flexDirection: "row", gap: 8, marginTop: theme.spacing.md },
  btn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
  },
  btnActive: { backgroundColor: theme.colors.primary },
  text: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  textActive: { color: theme.colors.onPrimary },
}));
