// C:\OOTDify\src\features\wardrobe\WardrobeSwitcher.tsx
// The Closet | Outfits page tabs under the Wardrobe tab's header. They are the
// top level of the page, so they read as tabs (text on a rule, the active one
// underlined), not as one more pill: pills inside the page stay for filters
// and views, which sit below the actions.
import { Pressable, StyleSheet, Text, View } from "react-native";

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
    <View style={styles.bar} accessibilityRole="tablist">
      {options.map(([key, label]) => {
        const active = section === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            hitSlop={{ top: 8, bottom: 4 }}
            style={({ pressed }) => [styles.tab, pressed && !active && styles.pressed]}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {label}
            </Text>
            <View style={[styles.indicator, active && styles.indicatorActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  bar: {
    flexDirection: "row",
    gap: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tab: { paddingTop: 6 },
  pressed: { opacity: 0.6 },
  text: { fontSize: 16, fontWeight: "600", color: theme.colors.textMuted, paddingBottom: 10 },
  textActive: { color: theme.colors.text, fontWeight: "700" },
  // Sits on the bar's rule, so the active tab looks connected to the page below.
  indicator: { height: 3, borderRadius: 2, marginBottom: -StyleSheet.hairlineWidth },
  indicatorActive: { backgroundColor: theme.colors.text },
}));
