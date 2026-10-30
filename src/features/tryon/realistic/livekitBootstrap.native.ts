// C:\OOTDify\src\features\tryon\realistic\livekitBootstrap.native.ts
// Registers LiveKit's WebRTC globals (RTCPeerConnection, MediaStream, web
// streams, URL, crypto.randomUUID, ...) that @decartai/sdk's React Native
// realtime client reads. Decart's and LiveKit's React Native docs require this
// to run before the router or root component is imported, so the app entry
// (index.ts) imports this file first.
//
// Builds without the WebRTC native module (Expo Go, an older dev build) skip
// it: importing LiveKit there throws and would crash the app at launch.
import { NativeModules } from "react-native";

import { webRTCLinked } from "./session";

if (webRTCLinked(NativeModules)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@livekit/react-native") as typeof import("@livekit/react-native")).registerGlobals();
}
