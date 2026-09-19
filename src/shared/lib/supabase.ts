import { createClient } from "@supabase/supabase-js";
import "expo-sqlite/localStorage/install";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // localStorage is installed by expo-sqlite on native and exists in the
    // browser, but not during static web rendering (Node). Fall back to the
    // supabase-js default storage adapter so exporting/deploying web works.
    ...(typeof localStorage !== "undefined" ? { storage: localStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
