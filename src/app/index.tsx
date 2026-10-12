// C:\OOTDify\src\app\index.tsx
// Root "/" route: renders nothing — the root layout's auth gate redirects to
// (auth) or (tabs)/home once the session loads. Exists so a cold start at "/"
// shows a clean boot instead of flashing the +not-found screen.
import { View } from "react-native";
// C:\OOTDify\src\app\index.tsx
// Root "/" route: renders nothing — the root layout's auth gate redirects to
// (auth) or (tabs)/home once the session loads.

export default function RootIndex() {
  return <View />;
}