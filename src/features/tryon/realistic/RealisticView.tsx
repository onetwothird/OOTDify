// C:\OOTDify\src\features\tryon\realistic\RealisticView.tsx
// UI for "Go realistic" on /tryon/live:
//   - RealisticStage covers the camera area while the preview camera is
//     released: "Starting…", then Decart's redrawn stream with a countdown pill
//     and "Stop", then the ended / failed / not-set-up message with "Back to
//     live preview". Camera chrome uses the fixed on-camera colours.
//   - RealisticConsentSheet is the one-time consent, on the themed Sheet.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Sheet } from "../../../shared/components/Sheet";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { CAMERA_BG, ON_CAMERA } from "../ar/cameraChrome";
import { releasesCamera } from "./session";
import type { RealisticSession } from "./useRealisticSession";
import { realtimeDeps } from "./webrtc";

export function RealisticStage({
  session,
  facing,
  topOffset,
}: {
  session: RealisticSession;
  facing: "front" | "back";
  /** Clears the top camera buttons. */
  topOffset: number;
}) {
  const styles = useStyles();
  const { t } = useT();
  const { phase, secondsLeft, remoteStream } = session;
  if (!releasesCamera(phase)) return null;

  const message =
    phase === "ended"
      ? t("tryon.live.realistic_ended")
      : phase === "failed"
        ? t("tryon.live.realistic_failed")
        : phase === "not_configured"
          ? t("tryon.live.realistic_not_configured")
          : phase === "unsupported"
            ? t("tryon.live.realistic_unsupported")
            : null;
  // A remote stream only exists when the WebRTC module loaded.
  const RTCView = realtimeDeps()?.webrtc.RTCView;

  return (
    <View style={styles.stage}>
      {phase === "live" && remoteStream && RTCView ? (
        <RTCView
          style={StyleSheet.absoluteFill}
          streamURL={remoteStream.toURL()}
          objectFit="cover"
          // Front camera frames arrive unmirrored; show them like a mirror.
          mirror={facing === "front"}
          zOrder={0}
        />
      ) : null}

      {phase === "connecting" || (phase === "live" && !remoteStream) ? (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={ON_CAMERA} />
          <Text style={styles.onCamera}>{t("tryon.live.realistic_connecting")}</Text>
        </View>
      ) : null}

      {phase === "live" ? (
        <View style={[styles.liveBar, { top: topOffset }]}>
          <View style={styles.pill}>
            <View style={styles.scrim} />
            <Text style={styles.pillText} accessibilityLiveRegion="polite">
              {t("tryon.live.realistic_seconds", { seconds: secondsLeft })}
            </Text>
          </View>
        </View>
      ) : null}

      {phase === "live" || phase === "connecting" ? (
        <View style={styles.bottom}>
          <Pressable accessibilityRole="button" style={styles.stopBtn} onPress={session.stop}>
            <Text style={styles.stopText}>{t("tryon.live.realistic_stop")}</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? (
        <View style={styles.center}>
          <Text style={styles.onCamera} accessibilityLiveRegion="polite">
            {message}
          </Text>
          <Pressable accessibilityRole="button" style={styles.backBtn} onPress={session.back}>
            <Text style={styles.backText}>{t("tryon.live.realistic_back")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function RealisticConsentSheet({ session }: { session: RealisticSession }) {
  const styles = useStyles();
  const { t } = useT();
  return (
    <Sheet
      visible={session.phase === "consent"}
      onClose={session.back}
      title={t("tryon.live.go_realistic")}
      icon="sparkles-outline"
      footer={
        <Pressable accessibilityRole="button" style={styles.acceptBtn} onPress={session.accept}>
          <Text style={styles.acceptText}>{t("scan.consent.continue")}</Text>
        </Pressable>
      }
    >
      <Text style={styles.consentBody}>{t("tryon.live.realistic_consent")}</Text>
    </Sheet>
  );
}

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const useStyles = makeStyles((theme: Theme) => ({
  stage: { ...FILL, backgroundColor: CAMERA_BG },
  center: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: theme.spacing.lg,
  },
  onCamera: { ...theme.typography.body, color: ON_CAMERA, textAlign: "center" },
  liveBar: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    minWidth: 76,
    alignItems: "center",
  },
  scrim: { ...FILL, backgroundColor: CAMERA_BG, opacity: 0.55 },
  pillText: { color: ON_CAMERA, fontWeight: "600", fontSize: 14, fontVariant: ["tabular-nums"] },
  // Clears the sheet that overlaps the stage's bottom edge.
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: theme.borderRadius.lg + theme.spacing.md,
    alignItems: "center",
  },
  stopBtn: {
    backgroundColor: ON_CAMERA,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  stopText: { color: CAMERA_BG, fontWeight: "700", fontSize: 15 },
  backBtn: {
    borderWidth: 1.5,
    borderColor: ON_CAMERA,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  backText: { color: ON_CAMERA, fontWeight: "600", fontSize: 15 },
  consentBody: { ...theme.typography.body, color: theme.colors.text },
  acceptBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  acceptText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 15 },
}));
