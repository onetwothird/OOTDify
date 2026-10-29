// App entry. LiveKit's WebRTC globals must be registered before expo-router
// loads any route (Decart realistic mode reads them; see livekitBootstrap).
import "./src/features/tryon/realistic/livekitBootstrap";
import "expo-router/entry";
