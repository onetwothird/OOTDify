// C:\OOTDify\src\features\notifications\nativePush.ts
// The only place that loads expo-notifications. Expo Go on Android has no
// push native code, and the package throws the moment it is imported there
// ("Cannot find native module 'ExpoTopicSubscriptionModule'"), so it is
// loaded lazily and only where it can work: a development or store build,
// or iOS. Everywhere else callers get null and report push as unsupported.
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

export function nativePush(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  const expoGoAndroid =
    Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cached = Platform.OS === "web" || expoGoAndroid ? null : (require("expo-notifications") as NotificationsModule);
  return cached;
}
