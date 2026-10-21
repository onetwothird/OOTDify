// C:\OOTDify\src\shared\lib\formFile.ts
// React Native's FormData is NOT the web one: a "blob" part is any object with a
// `uri` attribute (see node_modules/react-native/Libraries/Network/FormData.js
// `getParts()`), and anything else is stringified with String(value). That means
// passing a real Blob — or anything without `uri` — silently uploads the text
// "[object Blob]" instead of the image bytes, while still reporting success.
//
// So every storage upload in this app passes this `{ uri, name, type }` shape
// instead of a Blob. `mimeOf`/`nameOf` derive sensible defaults from the URI's
// extension when a caller has no better information.

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
};

/** Best-effort MIME type for a local file URI. */
export function mimeOf(uri: string, fallback = "image/jpeg"): string {
  const clean = uri.split("?")[0].toLowerCase();
  const ext = clean.includes(".") ? clean.split(".").pop() ?? "" : "";
  return MIME_BY_EXT[ext] ?? fallback;
}

/** A filename for a local file URI, guaranteeing an extension. */
export function nameOf(uri: string, fallback = "photo.jpg"): string {
  const clean = uri.split("?")[0];
  const base = clean.split("/").pop() ?? "";
  return base && base.includes(".") ? base : `${Date.now()}-${fallback}`;
}

/**
 * The object React Native's FormData can actually serialize as a file part.
 * Typed as the DOM `Blob`/`File` shape the storage client accepts, because the
 * extra `uri` field is what RN reads; the cast is the documented RN convention
 * rather than a lie about the value.
 */
export function formFile(uri: string, name?: string, type?: string): Blob {
  return {
    uri,
    name: name ?? nameOf(uri),
    type: type ?? mimeOf(uri),
  } as unknown as Blob;
}
