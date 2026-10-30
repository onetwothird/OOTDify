import { webRTCLinked } from "../session";

describe("webRTCLinked", () => {
  it("is true only when the build registered LiveKit's WebRTCModule", () => {
    expect(webRTCLinked({ WebRTCModule: {} })).toBe(true);
    // Expo Go or a dev build made before WebRTC was added: bridgeless gives
    // null, the legacy bridge gives undefined.
    expect(webRTCLinked({ WebRTCModule: null })).toBe(false);
    expect(webRTCLinked({})).toBe(false);
  });
});
