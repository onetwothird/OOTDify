import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";
import { makeStyles } from "../shared/theme/makeStyles";
import type { Theme } from "../shared/config/theme";
import { useT } from "../shared/i18n/useT";

export default function NotFoundScreen() {
  const styles = useStyles();
  const { t } = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("notfound.stack_title") }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t("notfound.title")}</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>{t("notfound.link")}</Text>
        </Link>
      </View>
    </>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.text,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: theme.colors.brand,
    fontWeight: "600",
  },
}));
