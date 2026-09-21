// C:\OOTDify\src\services\aiApi.ts
// Typed client for the OOTDify Flask backend — thin layer over apiClient.ts.
//
// Every user-specific endpoint is authenticated: the current Supabase session
// token is attached as `Authorization: Bearer <access_token>`, and the backend
// validates it server-side. The backend derives the user id from the token —
// this client never sends a user id.
//
// All uploads go through RN's FormData convention ({uri, name, type}), which
// the backend validates (extension, magic bytes, size) before touching them.
//
// NO fake data: every response is whatever the real backend returned. Try-on
// jobs that cannot be processed (e.g. VTON model not configured) come back as
// status "failed" with an honest error string.
//
// Errors are ApiErrors with a machine-readable `kind` and a friendly message
// (see apiClient.ts). Raw backend details never reach the UI.

import { API_AI_TIMEOUT_MS, API_TIMEOUT_MS, API_BASE_URL } from "../shared/config/api";
import {
  ApiError,
  apiRequest,
  checkBackendHealth,
  getAccessToken,
  healthCheck,
  isAuthError,
} from "./apiClient";

export {
  ApiError,
  checkBackendHealth,
  healthCheck,
  isAuthError,
} from "./apiClient";
export type { HealthResult } from "./apiClient";

// ---------------------------------------------------------------------------
// Types (mirror the backend contracts)
// ---------------------------------------------------------------------------

export interface ApiErrorPayload {
  success?: boolean;
  error?: string;
  [k: string]: unknown;
}

export interface Detection {
  class: string;
  confidence: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
}

export interface PoseAnalysis {
  success: boolean;
  personDetected: boolean;
  keypoints: Array<{ name: string; x: number; y: number; confidence: number }>;
  inference_ms: number | null;
  model: string | null;
  error: string | null;
}

export interface SegmentationAnalysis {
  success: boolean;
  personDetected: boolean;
  maskCount: number;
  detections: Detection[];
  inference_ms: number | null;
  model: string | null;
  error: string | null;
}

export interface AnalyzeResult {
  personDetected: boolean;
  personConfidence: number | null;
  detections: Detection[];
  pose: PoseAnalysis;
  segmentation: SegmentationAnalysis;
}

export interface BodyPhoto {
  id: string;
  user_id: string;
  storage_path: string;
  detection: {
    personDetected: boolean;
    personConfidence: number | null;
    detections: Detection[];
  };
  pose: PoseAnalysis;
  segmentation: SegmentationAnalysis;
  created_at: string;
}

export interface BodyPhotoWithUrl extends BodyPhoto {
  signedUrl: string | null;
}

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  body_photo_url: string | null;
  preferred_styles: string[];
  preferred_colors: string[];
  sizes: string[];
  preferred_categories: string[];
  preferred_occasions: string[];
  updated_at: string;
}

export type TryOnStatus = "uploading" | "queued" | "processing" | "completed" | "failed";

export interface TryOnJob {
  id: string;
  user_id: string;
  body_photo_id: string | null;
  clothing_ids: string[];
  status: TryOnStatus;
  result_url: string | null;
  /** Short-lived signed URL of the result (backend also returns it). */
  resultSignedUrl?: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  gender: string;
  color: string[];
  sizes: string[];
  style: string | null;
  brand: string | null;
  occasion: string[];
  price: number | null;
  currency: string;
  image_url: string;
  thumbnail_url: string | null;
  created_at: string;
  /** Added by /api/recommend. */
  score?: number;
  score_normalized?: number;
}

export interface Recommendation {
  recommendations: CatalogItem[];
  occasion: string | null;
}

export interface PrivacySummary {
  bodyPhotos: number;
  wardrobeItems: number;
  tryOnJobs: number;
  savedOutfits: number;
  favorites: number;
  recentlyViewed: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileMimeType(uri: string): string {
  const ext = uri.split("?").pop()?.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

function fileBaseName(uri: string): string {
  const cleaned = uri.split("?")[0];
  const name = cleaned.split("/").pop() ?? "";
  return name && name.includes(".") ? name : `photo_${Date.now()}.jpg`;
}

function toNativeFormFile(uri: string) {
  return {
    uri,
    name: fileBaseName(uri),
    type: fileMimeType(uri),
  } as unknown as Blob;
}

// ---------------------------------------------------------------------------
// Analyze (stateless — nothing is persisted or retained)
// ---------------------------------------------------------------------------
export async function analyzeImage(
  photoUri: string,
  kind: "body" | "clothing" = "body",
  timeoutMs = API_AI_TIMEOUT_MS,
): Promise<{ kind: string; analysis: AnalyzeResult }> {
  const formData = new FormData();
  formData.append("image", toNativeFormFile(photoUri));
  formData.append("kind", kind);

  const payload = (await apiRequest<{ success: boolean; kind: string; analysis: AnalyzeResult }>(
    "/api/analyze",
    { method: "POST", body: formData },
    { timeoutMs },
  )) as unknown;
  return { kind: (payload as { kind: string }).kind ?? kind, analysis: (payload as { analysis: AnalyzeResult }).analysis };
}

// ---------------------------------------------------------------------------
// Body photos (private; owned by the signed-in user only)
// ---------------------------------------------------------------------------
export async function uploadBodyPhoto(
  photoUri: string,
  timeoutMs = API_AI_TIMEOUT_MS,
): Promise<{ body_photo: BodyPhoto; analysis: AnalyzeResult; signedUrl: string | null }> {
  const formData = new FormData();
  formData.append("image", toNativeFormFile(photoUri));

  const payload = (await apiRequest<{
    success: boolean;
    body_photo: BodyPhoto;
    analysis: AnalyzeResult;
    signedUrl: string | null;
  }>("/api/body-photos", { method: "POST", body: formData }, { timeoutMs })) as unknown;
  const p = payload as { body_photo?: BodyPhoto; analysis?: AnalyzeResult; signedUrl?: string | null };
  if (!p.body_photo) {
    throw new ApiError("invalid-response", "The AI service returned an unexpected response.", 200, payload);
  }
  return { body_photo: p.body_photo, analysis: p.analysis as AnalyzeResult, signedUrl: p.signedUrl ?? null };
}

export async function listBodyPhotos(): Promise<BodyPhotoWithUrl[]> {
  const payload = (await apiRequest<{ success: boolean; body_photos: BodyPhotoWithUrl[] }>(
    "/api/body-photos",
    { method: "GET" },
  )) as unknown;
  return (payload as { body_photos?: BodyPhotoWithUrl[] }).body_photos ?? [];
}

export async function deleteBodyPhoto(photoId: string): Promise<void> {
  await apiRequest(`/api/body-photos/${photoId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Profile & privacy
// ---------------------------------------------------------------------------
export async function getProfile(): Promise<{ profile: UserProfile; email: string | null }> {
  const payload = (await apiRequest<{ success: boolean; profile: UserProfile; email: string | null }>(
    "/api/profile",
    { method: "GET" },
  )) as unknown;
  const p = payload as { profile?: UserProfile; email?: string | null };
  if (!p.profile) {
    throw new ApiError("invalid-response", "The AI service returned an unexpected response.", 200, payload);
  }
  return { profile: p.profile, email: p.email ?? null };
}

export async function updateProfile(
  fields: Partial<
    Pick<
      UserProfile,
      | "display_name"
      | "avatar_url"
      | "preferred_styles"
      | "preferred_colors"
      | "sizes"
      | "preferred_categories"
      | "preferred_occasions"
    >
  >,
): Promise<UserProfile> {
  const payload = (await apiRequest<{ success: boolean; profile: UserProfile }>(
    "/api/profile",
    { method: "PATCH", body: JSON.stringify(fields) },
  )) as unknown;
  const p = payload as { profile?: UserProfile };
  if (!p.profile) {
    throw new ApiError("invalid-response", "The AI service returned an unexpected response.", 200, payload);
  }
  return p.profile;
}

export async function getPrivacySummary(): Promise<PrivacySummary> {
  const payload = (await apiRequest<{ success: boolean; summary: PrivacySummary }>(
    "/api/privacy/summary",
    { method: "GET" },
  )) as unknown;
  const summary = (payload as { summary?: PrivacySummary }).summary;
  if (!summary) {
    throw new ApiError("invalid-response", "The AI service returned an unexpected response.", 200, payload);
  }
  return summary;
}

/** Download My Data — returns the raw JSON export text and the server filename. */
export async function exportAccountData(timeoutMs = 60_000): Promise<{
  filename: string;
  json: string;
}> {
  const token = await getAccessToken();
  if (!token) throw new ApiError("auth", "Your session has expired. Please sign in again.", 401, null);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/account/export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ApiError(
        res.status >= 500 ? "server" : "http",
        res.status >= 500
          ? "Something went wrong on our end. Please try again in a moment."
          : "The service couldn't complete that request. Please try again.",
        res.status,
        null,
      );
    }
    const text = await res.text();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    return {
      filename: match?.[1] ?? `ootdify-export-${Date.now()}.json`,
      json: text,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new ApiError(
      timedOut ? "timeout" : "network",
      timedOut
        ? "The request took too long. Check your connection and try again."
        : "AI styling is temporarily unavailable. Make sure the AI service is running and try again.",
      0,
      null,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Permanently delete the account and all data. Caller must already confirm. */
export async function deleteAccount(): Promise<void> {
  await apiRequest("/api/account", { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Try-on jobs
// ---------------------------------------------------------------------------
export interface CreateTryOnJobInput {
  bodyPhotoId: string;
  clothingIds: string[];
}

function parseJob(payload: unknown): TryOnJob {
  const job = (payload as { job?: TryOnJob | null }).job;
  if (!job) {
    throw new ApiError("invalid-response", "The AI service returned an unexpected response.", 200, payload);
  }
  return job;
}

export async function createTryOnJob(input: CreateTryOnJobInput): Promise<TryOnJob> {
  const payload = await apiRequest(
    "/api/tryon",
    {
      method: "POST",
      body: JSON.stringify({
        body_photo_id: input.bodyPhotoId,
        clothing_ids: input.clothingIds,
      }),
    },
    { timeoutMs: API_TIMEOUT_MS },
  );
  return parseJob(payload);
}

export async function getTryOnJob(jobId: string): Promise<TryOnJob> {
  const payload = await apiRequest(`/api/tryon/${jobId}`, { method: "GET" });
  return parseJob(payload);
}

export async function listTryOnJobs(): Promise<TryOnJob[]> {
  const payload = await apiRequest("/api/tryon", { method: "GET" });
  const jobs = (payload as { jobs?: TryOnJob[] }).jobs;
  return jobs ?? [];
}

export async function retryTryOnJob(jobId: string): Promise<TryOnJob> {
  const payload = await apiRequest(`/api/tryon/${jobId}/retry`, { method: "POST" });
  return parseJob(payload);
}

export async function deleteTryOnJob(jobId: string): Promise<void> {
  await apiRequest(`/api/tryon/${jobId}`, { method: "DELETE" });
}

export interface PollTryOnOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onStatus?: (job: TryOnJob) => void;
}

export const TRY_ON_TERMINAL_STATES: TryOnStatus[] = ["completed", "failed"];

/**
 * Poll a try-on job until it reaches a terminal state. Resolves with the
 * terminal job, or rejects with ApiError when polling times out.
 */
export async function pollTryOnJob(
  jobId: string,
  options: PollTryOnOptions = {},
): Promise<TryOnJob> {
  const { intervalMs = 2500, maxAttempts = 60, onStatus } = options;
  let attempts = 0;
  for (;;) {
    const job = await getTryOnJob(jobId);
    onStatus?.(job);
    if (TRY_ON_TERMINAL_STATES.includes(job.status)) return job;
    attempts += 1;
    if (attempts >= maxAttempts) {
      throw new ApiError("timeout", "The try-on job is still processing. Check back later.", 0, null);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---------------------------------------------------------------------------
// Recommendations (real catalog ids, scored server-side)
// ---------------------------------------------------------------------------
export async function recommendCatalog(
  options: { occasion?: string; limit?: number } = {},
): Promise<Recommendation> {
  const payload = await apiRequest(
    "/api/recommend",
    {
      method: "POST",
      body: JSON.stringify({ occasion: options.occasion ?? null, limit: options.limit ?? 8 }),
    },
    { timeoutMs: API_TIMEOUT_MS },
  );
  const p = payload as { recommendations?: CatalogItem[]; occasion?: string | null };
  if (!Array.isArray(p.recommendations)) {
    throw new ApiError("invalid-response", "The AI service returned an unexpected response.", 200, payload);
  }
  return {
    recommendations: p.recommendations,
    occasion: p.occasion ?? null,
  };
}