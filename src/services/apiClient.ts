// C:\OOTDify\src\services\apiClient.ts
// Reusable, error-aware HTTP client for the OOTDify Flask backend.
//
// What it does:
//   * Reads the base URL from EXPO_PUBLIC_API_URL (see shared/config/api.ts).
//   * Applies a sensible request timeout (AbortController).
//   * Categorizes failures: network | timeout | auth | server | http |
//     invalid-response | aborted | unknown.
//   * Attaches the Supabase session token (backend derives identity from the
//     token — never from a client-supplied user id).
//   * Turns every failure into a *friendly, user-safe* message. Raw backend
//     details are only logged in development, never shown to users.
//
// PRIVACY: this module never logs photo data, tokens, or request bodies —
// only method/URL/status/kind.

import {
  API_BASE_URL,
  API_TIMEOUT_MS,
  API_HEALTH_TIMEOUT_MS,
} from "../shared/config/api";
import { supabase } from "../shared/lib/supabase";

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export type ApiErrorKind =
  | "network" // host unreachable / DNS / connection refused / offline
  | "timeout" // request exceeded its deadline
  | "auth" // 401 — session missing/expired/invalid
  | "server" // 5xx — backend crashed or misbehaved
  | "http" // other non-2xx with a usable response
  | "invalid-response" // 2xx but the body was not what we expected
  | "aborted" // caller cancelled (component unmounted etc.)
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly payload: unknown;

  constructor(kind: ApiErrorKind, message: string, status = 0, payload: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.payload = payload;
  }
}

export const isAuthError = (err: unknown): boolean =>
  err instanceof ApiError && (err.kind === "auth" || err.status === 401);

/** User-safe message per failure category. No internals, no stack traces. */
export function friendlyMessageFor(kind: ApiErrorKind): string {
  switch (kind) {
    case "network":
      return "AI styling is temporarily unavailable. Make sure the AI service is running and try again.";
    case "timeout":
      return "The request took too long. Check your connection and try again.";
    case "auth":
      return "Your session has expired. Please sign in again.";
    case "server":
      return "Something went wrong on our end. Please try again in a moment.";
    case "http":
      return "The service couldn't complete that request. Please try again.";
    case "invalid-response":
      return "The AI service returned an unexpected response. Please try again.";
    case "aborted":
      return "The request was cancelled.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Build an ApiError with friendly copy; server detail is kept for dev logs only. */
export function toFriendlyError(
  kind: ApiErrorKind,
  status: number,
  payload: unknown,
): ApiError {
  const err = new ApiError(kind, friendlyMessageFor(kind), status, payload);
  if (__DEV__) {
    const serverMsg =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "")
        : "";
    console.warn(
      `[api] ${kind}${status ? ` status=${status}` : ""}${serverMsg ? ` :: ${serverMsg}` : ""}`,
    );
  }
  return err;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export { getAccessToken };

// ---------------------------------------------------------------------------
// Low-level request
// ---------------------------------------------------------------------------

export type RequestBody = BodyInit | null;

export interface ApiRequestOptions {
  timeoutMs?: number;
  /** Attach the Supabase session token. Defaults to true. */
  auth?: boolean;
}

/**
 * Perform an authenticated (or public) request against the backend.
 * Never throws raw TypeError/AbortError — always an ApiError with a kind.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  const { timeoutMs = API_TIMEOUT_MS, auth = true } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = await getAccessToken();
    if (!token) {
      clearTimeout(timer);
      throw new ApiError("auth", friendlyMessageFor("auth"), 401, null);
    }
    headers.Authorization = `Bearer ${token}`;
  }
  // Only force Content-Type for JSON; FormData must NOT have it set (RN adds
  // the multipart boundary automatically).
  const isForm = init.body instanceof FormData;
  if (!isForm && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let raw: globalThis.Response;
  try {
    raw = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw toFriendlyError(timedOut ? "timeout" : "network", 0, null);
  }
  clearTimeout(timer);

  let payload: unknown = null;
  try {
    payload = await raw.json();
  } catch {
    payload = null; // not JSON (empty / 204 / HTML error page)
  }

  if (!raw.ok) {
    const kind: ApiErrorKind =
      raw.status === 401 ? "auth" : raw.status >= 500 ? "server" : "http";
    throw toFriendlyError(kind, raw.status, payload);
  }

  // 2xx — hand the (possibly null) payload to the caller, which validates shape.
  return payload as T;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResult {
  /** Network layer reached a server that answered. */
  reachable: boolean;
  /** reachable AND the body matched the expected /health contract. */
  ok: boolean;
  service: string | null;
  modelLoaded: boolean | null;
  kind: ApiErrorKind | null;
  /** Friendly, user-safe message when !ok (null when healthy). */
  message: string | null;
}

/**
 * Probe GET /health with a short timeout and validate the response contract:
 *   { "status": "ok", "service": "ootdify-ai", ... }
 * Never throws — returns a structured HealthResult instead.
 */
export async function checkBackendHealth(): Promise<HealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_HEALTH_TIMEOUT_MS);
  try {
    let raw: globalThis.Response;
    try {
      raw = await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      const kind: ApiErrorKind = timedOut ? "timeout" : "network";
      return {
        reachable: false,
        ok: false,
        service: null,
        modelLoaded: null,
        kind,
        message: friendlyMessageFor(kind),
      };
    }
    if (!raw.ok) {
      const kind: ApiErrorKind = raw.status >= 500 ? "server" : "http";
      return {
        reachable: true,
        ok: false,
        service: null,
        modelLoaded: null,
        kind,
        message: friendlyMessageFor(kind),
      };
    }
    let body: unknown;
    try {
      body = await raw.json();
    } catch {
      return {
        reachable: true,
        ok: false,
        service: null,
        modelLoaded: null,
        kind: "invalid-response",
        message: friendlyMessageFor("invalid-response"),
      };
    }
    const b = (body ?? {}) as {
      status?: unknown;
      service?: unknown;
      model_loaded?: unknown;
    };
    const serviceOk = b.status === "ok" && (b.service === "ootdify-ai" || b.service == null);
    return {
      reachable: true,
      ok: serviceOk,
      service: typeof b.service === "string" ? b.service : null,
      modelLoaded: typeof b.model_loaded === "boolean" ? b.model_loaded : null,
      kind: serviceOk ? null : "invalid-response",
      message: serviceOk ? null : friendlyMessageFor("invalid-response"),
    };
  } catch {
    return {
      reachable: false,
      ok: false,
      service: null,
      modelLoaded: null,
      kind: "unknown",
      message: friendlyMessageFor("unknown"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Backwards-compatible boolean probe. */
export async function healthCheck(): Promise<boolean> {
  const result = await checkBackendHealth();
  return result.ok;
}