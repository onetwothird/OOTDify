// C:\OOTDify\src\shared\components\LoadingState.tsx
// Pulsing skeleton placeholders + centered spinner (no fixed pixel layouts).
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Skeleton, SkeletonCard } from "./Skeleton";
import { useResponsiveColumns } from "../hooks/useResponsiveColumns";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

export function LoadingState({ label }: { label?: string }) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.center} testID="loading-state">
      <ActivityIndicator color={theme.colors.brand} size="large" />
      {label ? <View /> : null}
    </View>
  );
}

/** Grid of pulsing card skeletons while a catalog/grid loads. */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  const styles = useStyles();
  const { columns, itemWidth, onLayout } = useResponsiveColumns(110, 12);
  const n = count || columns;
  return (
    <View style={styles.grid} onLayout={onLayout}>
      {Array.from({ length: n }).map((_, i) => (
        <SkeletonCard key={i} width={itemWidth} />
      ))}
    </View>
  );
}

export function SkeletonRow() {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.row}>
      <Skeleton width={56} height={56} radius={theme.borderRadius.md} />
      <View style={styles.rowBody}>
        <Skeleton width="85%" height={14} />
        <Skeleton width="55%" height={11} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl * 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  rowBody: { flex: 1, gap: 8 },
}));