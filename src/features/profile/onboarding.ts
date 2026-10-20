// C:\OOTDify\src\features\profile\onboarding.ts
// Post-signup onboarding prompt: a fresh account is asked once for its
// preferred nickname and style preferences. The prompt state is a LOCAL flag
// (tagged with the signup email, the same pattern as the pending avatar) — it
// holds no profile data, only the fact that this account hasn't been asked
// yet. The flag is set when the account is created and cleared the moment the
// user saves or skips, so the prompt never loops.
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "ootdify.onboarding-pending";

interface PendingOnboarding {
  email: string;
}

/** Remember that this just-created account still owes us an answer. */
export async function markOnboardingPending(email: string): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify({ email }));
}

/** Clear the prompt — called on save and on skip alike. */
export async function clearOnboardingPending(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}

/**
 * True when the given account finished signup but hasn't answered the prompt.
 * Email-tagged so a prompt created for one account never fires for another
 * signed in on the same device.
 */
export async function isOnboardingPending(
  email: string | null | undefined,
): Promise<boolean> {
  const mine = (email ?? "").trim().toLowerCase();
  if (!mine) return false;
  const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOnboarding>;
    return typeof parsed.email === "string" && parsed.email.trim().toLowerCase() === mine;
  } catch {
    return false;
  }
}
