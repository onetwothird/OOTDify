// C:\OOTDify\src\features\capture\EditClothingModal.tsx
// Edit the metadata of a user-owned wardrobe item: name, category, color, size,
// brand, style, season, occasion, tags. Saves through the wardrobe store
// (which persists via RLS-guarded Supabase update). No photos change here.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OCCASIONS, SEASONS, WARDROBE_CATEGORIES } from "../clothing/types";
import { ClothingItem } from "../clothing/types";
import { useWardrobeStore } from "../wardrobe/store";
import { theme } from "../../shared/config/theme";

interface Props {
  item: ClothingItem | null;
  onClose: () => void;
}

export default function EditClothingModal({ item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const updateItem = useWardrobeStore((s) => s.updateItem);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [brand, setBrand] = useState("");
  const [style, setStyle] = useState("");
  const [season, setSeason] = useState<string | null>(null);
  const [occasions, setOccasions] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setName(item.name ?? "");
    setCategory(item.category ?? null);
    setColor(item.color ?? "");
    setSize(item.size ?? "");
    setBrand(item.brand ?? "");
    setStyle(item.style ?? "");
    setSeason(item.season ?? null);
    setOccasions(new Set(item.occasion ?? []));
    setTags((item.tags ?? []).join(", "));
    setError(null);
  }, [item]);

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
      setError(e instanceof Error ? e.message : "Could not save these details.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: StyleProp<TextStyle> = [styles.input, { color: theme.colors.text }];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboard}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>Edit item</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close-outline" size={26} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.body}
            >
              <Field label="Name">
                <TextInput
                  style={inputStyle}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Oversized black tee"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={60}
                />
              </Field>

              <Field label="Category">
                <View style={styles.chipWrap}>
                  {WARDROBE_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat === category ? null : cat)}
                      style={[styles.chip, cat === category && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, cat === category && styles.chipTextActive]}>
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <View style={styles.twoCol}>
                <Field label="Color" containerStyle={styles.colField}>
                  <TextInput
                    style={inputStyle}
                    value={color}
                    onChangeText={setColor}
                    placeholder="e.g. Black"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={30}
                  />
                </Field>
                <Field label="Size" containerStyle={styles.colField}>
                  <TextInput
                    style={inputStyle}
                    value={size}
                    onChangeText={setSize}
                    placeholder="S / M / 32"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={20}
                  />
                </Field>
              </View>

              <View style={styles.twoCol}>
                <Field label="Brand" containerStyle={styles.colField}>
                  <TextInput
                    style={inputStyle}
                    value={brand}
                    onChangeText={setBrand}
                    placeholder="Brand"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={40}
                  />
                </Field>
                <Field label="Style" containerStyle={styles.colField}>
                  <TextInput
                    style={inputStyle}
                    value={style}
                    onChangeText={setStyle}
                    placeholder="e.g. Streetwear"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={30}
                  />
                </Field>
              </View>

              <Field label="Season">
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

              <Field label="Occasions">
                <View style={styles.chipWrap}>
                  {OCCASIONS.map((occ) => (
                    <Pressable
                      key={occ}
                      onPress={() => toggleOccasion(occ)}
                      style={[styles.chip, occasions.has(occ) && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, occasions.has(occ) && styles.chipTextActive]}>
                        {occ}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field label="Tags" hint="Comma separated — helps search.">
                <TextInput
                  style={inputStyle}
                  value={tags}
                  onChangeText={setTags}
                  placeholder="oversized, summer, thrifted"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                />
              </Field>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                onPress={save}
                disabled={saving}
                style={[styles.saveBtn, saving && styles.saveDisabled]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save details</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  keyboard: { justifyContent: "flex-end", maxHeight: "92%" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "92%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  body: { gap: 14, paddingBottom: 12 },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
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
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  saveDisabled: { opacity: 0.5 },
  saveBtnText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 15 },
});