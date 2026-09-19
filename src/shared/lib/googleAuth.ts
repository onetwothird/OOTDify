// C:\OOTDify\src\shared\lib\googleAuth.ts
// Browser-based Google OAuth via Supabase + expo-auth-session / expo-web-browser.
//
// Flow:
//   1. Ask Supabase for the Google authorization URL (skipBrowserRedirect: true
//      so we control opening it ourselves).
//   2. Open it in an in-app browser tab with expo-web-browser.
//   3. When Google redirects back to the app (ootdify://...), parse the URL:
//      - implicit flow  -> access_token + refresh_token in the fragment
//      - PKCE flow      -> a `code` in the query string
//   4. Hand the tokens/code back to Supabase so it persists the session, which
//      also fires the onAuthStateChange listener in the root layout.
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

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
 * Start the Google sign-in flow and exchange the result for a Supabase session.
 *
 * Resolves when the session is established, or when the user closes the
 * browser without completing sign-in (no-op). Throws on network/config errors
 * and when the redirect contains no usable session data.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectUrl = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      // Native apps must open the returned URL themselves; on web returning
      // the URL also lets expo-web-browser handle the popup window.
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error("Google sign-in could not start (no authorization URL).");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  // User dismissed/cancelled the browser, or the OS could not open it.
  if (result.type !== "success") return;

  const params = parseAuthParams(result.url);

  // PKCE flow: exchange the one-time authorization code for a session.
  if (params.code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    return;
  }

  // Implicit flow: hand the returned tokens to supabase-js so it persists the
  // session. A missing refresh token is tolerated (null is valid).
  if (params.access_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token ?? null,
    });
    if (sessionError) throw sessionError;
    return;
  }

  throw new Error(
    "Google sign-in returned no session data. Make sure the Google provider is enabled and the redirect URL is allowed."
  );
}