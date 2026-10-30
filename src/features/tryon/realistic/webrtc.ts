// C:\OOTDify\src\features\tryon\realistic\webrtc.ts
// The only place that loads LiveKit's WebRTC and the Decart SDK. Expo Go, the
// web build, and any dev build made before WebRTC was added have no
// WebRTCModule, and @livekit/react-native-webrtc throws the moment it is
// imported there ("WebRTC native module not found"). Because index.ts imports
// the bootstrap before the router, that throw used to kill the whole app at
// launch ("Runtime not ready"). So both packages load lazily, only when the
// native module is linked; everywhere else callers get null and realistic
// mode reports itself unsupported.
import { NativeModules } from "react-native";

import { webRTCLinked } from "./session";

export type WebRTCModule = typeof import("@livekit/react-native-webrtc");
export type DecartModule = typeof import("@decartai/sdk");

export interface RealtimeDeps {
  webrtc: WebRTCModule;
  decart: DecartModule;
}

let cached: RealtimeDeps | null | undefined;

export function realtimeDeps(): RealtimeDeps | null {
  if (cached !== undefined) return cached;
  cached = webRTCLinked(NativeModules)
    ? {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        webrtc: require("@livekit/react-native-webrtc") as WebRTCModule,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        decart: require("@decartai/sdk") as DecartModule,
      }
    : null;
  return cached;
}
