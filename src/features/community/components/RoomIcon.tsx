// C:\OOTDify\src\features\community\components\RoomIcon.tsx
// A community room's icon as a circle: its photo, a preset icon, or the first
// two letters of its title, in that order. Shared by the Communities list, the
// chat header and the icon picker so all three match.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Text, View } from "react-native";

import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { roomIconPreset } from "../roomIcons";

export function RoomIcon({
  size = 42,
  title,
  iconUrl,
  iconPreset,
}: {
  size?: number;
  title: string;
  /** Cloudinary URL, or a local file being previewed before upload. */
  iconUrl?: string | null;
  iconPreset?: string | null;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const preset = roomIconPreset(iconPreset);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.circle, circle]}>
      {iconUrl ? (
        <Image source={{ uri: iconUrl }} style={circle} contentFit="cover" transition={150} />
      ) : preset ? (
        <Ionicons name={preset} size={Math.round(size * 0.48)} color={theme.colors.onPrimary} />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.33) }]}>
          {title.trim().slice(0, 2).toUpperCase() || "?"}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  circle: {
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { color: theme.colors.onPrimary, fontWeight: "800" },
}));
