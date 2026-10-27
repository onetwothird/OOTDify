// Runs the live pose loop while the screen is focused, the app is in the
// foreground and the caller says so (`active`). Leaving the screen, or the app
// going to the background, stops it; nothing is sent after unmount.
import type { CameraView } from "expo-camera";
import { useIsFocused } from "expo-router";
import { RefObject, useEffect, useState } from "react";
import { AppState } from "react-native";

import { estimateLivePose } from "../../../services/aiApi";
import { createLiveLoop, INITIAL_LIVE_STATE, LiveLoopState } from "./liveLoop";

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setActive(next === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

export function useLivePose(cameraRef: RefObject<CameraView | null>, active: boolean): LiveLoopState {
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [state, setState] = useState<LiveLoopState>(INITIAL_LIVE_STATE);
  const running = active && focused && appActive;

  useEffect(() => {
    if (!running) return;
    const loop = createLiveLoop({
      capture: async () => {
        const camera = cameraRef.current;
        if (!camera) throw new Error("Camera is not ready.");
        const photo = await camera.takePictureAsync({ quality: 0.3, shutterSound: false });
        if (!photo?.uri) throw new Error("No photo was taken.");
        return photo.uri;
      },
      estimate: (uri) => estimateLivePose(uri),
      onState: setState,
    });
    loop.start();
    return () => loop.stop();
  }, [running, cameraRef]);

  return state;
}
