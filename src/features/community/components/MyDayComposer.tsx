// C:\OOTDify\src\features\community\components\MyDayComposer.tsx
// "Add to My Day": one tall photo from the gallery or camera and an optional
// caption. Friends can see it for 24 hours.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { useT } from "../../../shared/i18n/useT";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { communityErrorMessage } from "../service";
import { pickMyDayPhoto, postMyDay } from "../socialService";

const CAPTION_MAX = 200;

export function MyDayComposer({
  visible,
  onClose,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPhoto(null);
    setCaption("");
    onClose();
  };

  const pick = async (source: "camera" | "library") => {
    const uri = await pickMyDayPhoto(source);
    if (uri) setPhoto(uri);
  };

  const share = async () => {
    if (!photo || busy) return;
    setBusy(true);
    try {
      await postMyDay(photo, caption);
      toast.success(t("myday.toast.posted"));
      setPhoto(null);
      setCaption("");
      onPosted();
    } catch (e) {
      toast.error(t("myday.toast.post_error"), communityErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      busy={busy}
      icon="sunny-outline"
      title={t("myday.add")}
      subtitle={t("myday.add.subtitle")}
      footer={
        <AppButton
          label={t("myday.share")}
          icon="paper-plane-outline"
          onPress={() => void share()}
          loading={busy}
          disabled={!photo || busy}
        />
      }
    >
      <View style={styles.previewRow}>
        <View style={styles.preview}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <Ionicons name="image-outline" size={30} color={theme.colors.textMuted} />
          )}
        </View>
        <View style={styles.sources}>
          <SourceButton icon="images-outline" label={t("myday.gallery")} onPress={() => void pick("library")} />
          <SourceButton icon="camera-outline" label={t("myday.camera")} onPress={() => void pick("camera")} />
          <Text style={styles.expiry}>
            <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} /> {t("myday.expiry")}
          </Text>
        </View>
      </View>

      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder={t("myday.caption.placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        maxLength={CAPTION_MAX}
        multiline
        style={styles.caption}
      />
      <Text style={styles.counter}>
        {caption.length}/{CAPTION_MAX}
      </Text>
    </Sheet>
  );
}

function SourceButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.source, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.onPrimary} />
      <Text style={styles.sourceText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  previewRow: { flexDirection: "row", gap: 14 },
  preview: {
    width: 120,
    aspectRatio: 9 / 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImage: { width: "100%", height: "100%" },
  sources: { flex: 1, gap: 10, justifyContent: "center" },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  sourceText: { fontSize: 14, fontWeight: "600", color: theme.colors.onPrimary },
  expiry: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  caption: {
    minHeight: 72,
    maxHeight: 120,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.text,
    fontSize: 15,
    textAlignVertical: "top",
  },
  counter: { alignSelf: "flex-end", fontSize: 11.5, color: theme.colors.textMuted, marginTop: -6 },
}));
