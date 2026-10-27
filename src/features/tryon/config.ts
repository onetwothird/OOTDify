// Feature switches for try-on.
//
// The realistic photo try-on (body photo + garment → generated image) needs a
// real VTON model behind `VTONProvider.generate()` in
// backend/services/tryon_service.py, which today always fails. Until one is
// implemented and deployed, the app hides that flow and offers only the live
// preview. Flip this when the backend can really generate try-on images.
export const PHOTO_TRYON_AVAILABLE = false;
