// C:\OOTDify\src\app\(auth)\_layout.tsx
// The signed-out screens (landing, login, signup, password reset) are always
// drawn in the light palette, whatever the Appearance setting says. The nested
// StatusBar overrides the root one while these screens are mounted.
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { lightColors } from "../../shared/config/theme";
import { ForcedSchemeProvider } from "../../shared/theme/ThemeProvider";

export default function AuthLayout() {
  return (
    <ForcedSchemeProvider scheme="light">
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: lightColors.background },
        }}
      />
    </ForcedSchemeProvider>
  );
}
