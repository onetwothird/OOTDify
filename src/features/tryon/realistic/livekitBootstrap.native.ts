// C:\OOTDify\src\features\tryon\realistic\livekitBootstrap.native.ts
// Registers LiveKit's WebRTC globals (RTCPeerConnection, MediaStream, web
// streams, URL, crypto.randomUUID, ...) that @decartai/sdk's React Native
// realtime client reads. Decart's and LiveKit's React Native docs require this
// to run before the router or root component is imported, so the app entry
// (index.ts) imports this file first.
import { registerGlobals } from "@livekit/react-native";

registerGlobals();
