// C:\OOTDify\src\features\capture\EditClothingModal.tsx
// Edit the metadata of a user-owned wardrobe item: name, category, color, size,
// brand, style, season, occasion, tags. Saves through the wardrobe store
// (which persists via RLS-guarded Supabase update). No photos change here.
import { useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextStyle, View } from "react-native";

import { ClothingItem, OCCASIONS, SEASONS, WARDROBE_CATEGORIES } from "../clothing/types";
import { useWardrobeStore } from "../wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { Sheet } from "../../shared/components/Sheet";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useT } from "../../shared/i18n/useT";

interface Props {
  item: ClothingItem | null;
  onClose: () => void;
}

export default function EditClothingModal({ item, onClose }: Props) {
  const updateItem = useWardrobeStore((s) => s.updateItem);
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();

  // Fields initialize from `item` once, via lazy initializers. The parent only
  // mounts this modal while the user is editing, so every open starts fresh and
  // unsaved edits are never clobbered by background store updates.
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<string | null>(item?.category ?? null);
  const [color, setColor] = useState(item?.color ?? "");
  const [size, setSize] = useState(item?.size ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [style, setStyle] = useState(item?.style ?? "");
  const [season, setSeason] = useState<string | null>(item?.season ?? null);
  const [occasions, setOccasions] = useState<Set<string>>(new Set(item?.occasion ?? []));
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;
  const toggleOccasion = (occ: string) => {
    setOccasions((prev) => {
      const next = new Set(prev);
      if (next.has(occ)) next.delete(occ);
      else next.add(occ);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateItem(item.id, {
        name: name.trim() || null,
        category: category ?? undefined,
        color: color.trim() || null,
        size: size.trim() || null,
        brand: brand.trim() || null,
        style: style.trim() || null,
        season: season ?? undefined,
        occasion: Array.from(occasions),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capture.edit.error"));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: StyleProp<TextStyle> = [styles.input, { color: theme.colors.text }];

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={saving}
      icon="pricetag"
      title={t("capture.edit.title")}
      footer={
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton label={t("capture.edit.save")} loading={saving} onPress={save} />
        </>
      }
    >
      <Field label={t("capture.edit.field.name")}>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          placeholder={t("capture.edit.field.name_placeholder")}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={60}
        />
      </Field>

      <Field label={t("capture.edit.field.category")}>
        <View style={styles.chipWrap}>
          {WARDROBE_CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat === category ? null : cat)}
              style={[styles.chip, cat === category && styles.chipActive]}
            >
              <Text style={[styles.chipText, cat === category && styles.chipTextActive]}>
                {tl("category", cat)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <View style={styles.twoCol}>
        <Field label={t("capture.edit.field.color")} containerStyle={styles.colField}>
          <TextInput
            style={inputStyle}
            value={color}
            onChangeText={setColor}
            placeholder={t("capture.edit.field.color_placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={30}
          />
        </Field>
        <Field label={t("capture.edit.field.size")} containerStyle={styles.colField}>
          <TextInput
            style={inputStyle}
            value={size}
            onChangeText={setSize}
            placeholder={t("capture.edit.field.size_placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={20}
          />
        </Field>
      </View>

      <View style={styles.twoCol}>
        <Field label={t("capture.edit.field.brand")} containerStyle={styles.colField}>
          <TextInput
            style={inputStyle}
            value={brand}
            onChangeText={setBrand}
            placeholder={t("capture.edit.field.brand_placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={40}
          />
        </Field>
        <Field label={t("capture.edit.field.style")} containerStyle={styles.colField}>
          <TextInput
            style={inputStyle}
            value={style}
            onChangeText={setStyle}
            placeholder={t("capture.edit.field.style_placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={30}
          />
        </Field>
      </View>

      <Field label={t("capture.edit.field.season")}>
        <View style={styles.chipWrap}>
          {SEASONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSeason(s === season ? null : s)}
              style={[styles.chip, s === season && styles.chipActive]}
            >
              <Text style={[styles.chipText, s === season && styles.chipTextActive]}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label={t("capture.edit.field.occasions")}>
        <View style={styles.chipWrap}>
          {OCCASIONS.map((occ) => (
            <Pressable
              key={occ}
              onPress={() => toggleOccasion(occ)}
              style={[styles.chip, occasions.has(occ) && styles.chipActive]}
            >
              <Text style={[styles.chipText, occasions.has(occ) && styles.chipTextActive]}>
                {tl("occasion", occ)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label={t("capture.edit.field.tags")} hint={t("capture.edit.field.tags_hint")}>
        <TextInput
          style={inputStyle}
          value={tags}
          onChangeText={setTags}
          placeholder={t("capture.edit.field.tags_placeholder")}
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />
      </Field>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  children,
  containerStyle,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  containerStyle?: object;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  fieldHint: { fontSize: 11, color: theme.colors.textMuted },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    fontWeight: "500",
    backgroundColor: theme.colors.background,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12.5, fontWeight: "600", color: theme.colors.text },
  chipTextActive: { color: theme.colors.onPrimary },
  twoCol: { flexDirection: "row", gap: 12 },
  colField: { flex: 1 },
  error: { fontSize: 12.5, color: theme.colors.danger },
}));