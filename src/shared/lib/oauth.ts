// C:\OOTDify\src\shared\lib\oauth.ts
// Browser-based social sign-in (Google, Facebook) via Supabase + expo-web-browser.
//
// Flow:
//   1. Ask Supabase for the provider authorization URL (skipBrowserRedirect so
//      we open it ourselves and keep control of the redirect back into the app).
//   2. Open it in an in-app browser tab with expo-web-browser.
//   3. When the provider redirects back to the app (ootdify://…), parse the URL:
//      implicit flow → tokens in the fragment, PKCE flow → `code` in the query.
//   4. Hand the tokens/code back to Supabase so it persists the session, which
//      also fires the onAuthStateChange listener in the root layout.
//
// Both providers are configured entirely in the Supabase dashboard — no OAuth
// client secret ships in this bundle. If a provider isn't enabled server-side,
// sign-in fails with Supabase's own message (e.g. "provider is not enabled")
// and the caller surfaces it honestly instead of pretending to succeed.
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

export type SocialProvider = "google" | "facebook";

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  facebook: "Facebook",
};

// Required once on web so the auth popup can close itself after redirecting.
WebBrowser.maybeCompleteAuthSession();

/**
 * Extract OAuth params from a redirect URL. Tokens arrive either in the query
 * string (PKCE `code`) or the URL fragment (implicit `access_token` /
 * `refresh_token`), so both are parsed.
 */
function parseAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const [base, fragment] = url.split("#");
  const query = base.includes("?") ? base.slice(base.indexOf("?") + 1) : undefined;

  for (const source of [query, fragment]) {
    if (!source) continue;
    for (const pair of source.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
      if (!rawKey) continue;
      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
      } catch {
        // Ignore malformed percent-encoding; keep the raw value.
        params[rawKey] = rawValue;
      }
    }
  }

  return params;
}

/**
 * Start a social sign-in flow and exchange the result for a Supabase session.
 *
 * Resolves when the session is established, or when the user dismisses the
 * browser without completing sign-in (no-op). Throws on network/config errors
 * and when the redirect carries an error or no usable session data.
 */
export async function signInWithSocialProvider(
  provider: SocialProvider,
): Promise<void> {
  const label = PROVIDER_LABELS[provider];
  const redirectUrl = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      // Native apps must open the returned URL themselves; on web returning the
      // URL also lets expo-web-browser handle the popup window.
      skipBrowserRedirect: true,
      queryParams:
        provider === "google"
          ? { prompt: "select_account" }
          : { auth_type: "reauthenticate" },
    },
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error(`${label} sign-in could not start (no authorization URL).`);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  // User dismissed/cancelled the browser, or the OS could not open it.
  if (result.type !== "success") return;

  const params = parseAuthParams(result.url);

  // Provider reported a failure (user denied the consent screen, etc.).
  if (params.error) {
    const description = params.error_description ?? params.error;
    throw new Error(`${label} sign-in failed: ${description.replace(/\+/g, " ")}`);
  }

  // PKCE flow: exchange the one-time authorization code for a session.
  if (params.code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    return;
  }

  // Implicit flow: hand the returned tokens to supabase-js so it persists the
  // session. refresh_token is always present in this flow; fall back to "" only
  // to satisfy the non-nullable type.
  if (params.access_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token ?? "",
    });
    if (sessionError) throw sessionError;
    return;
  }

  throw new Error(
    `${label} sign-in returned no session data. Make sure the ${label} provider is ` +
      `enabled in Supabase and ${redirectUrl} is an allowed redirect URL.`,
  );
}

export function signInWithGoogle(): Promise<void> {
  return signInWithSocialProvider("google");
}

export function signInWithFacebook(): Promise<void> {
  return signInWithSocialProvider("facebook");
}
