// Feature switches for try-on.
//
// TRYON_UNDER_MAINTENANCE: the try-on screen shows a "we're working on it"
// page and the live AR entry points are hidden. Live AR is being replaced by
// photo try-on (capture → outfit → a preset model or your own photo, drawn by
// the AI; spec docs/superpowers/specs/2026-10-31-ai-photo-tryon-design.md).
// Turn it off once the new flow ships.
export const TRYON_UNDER_MAINTENANCE = true;

// The realistic photo try-on (body photo + garment → generated image). The
// backend draws it with Gemini when GEMINI_API_KEY is set
// (services/gemini_tryon.py); the app flow behind it is still being built.
export const PHOTO_TRYON_AVAILABLE = false;
