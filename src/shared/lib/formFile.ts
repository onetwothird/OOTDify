// C:\OOTDify\src\shared\lib\formFile.ts
// React Native's FormData is NOT the web one: a "blob" part is any object with a
// `uri` attribute (see node_modules/react-native/Libraries/Network/FormData.js
// `getParts()`), and anything else is stringified with String(value). That means
// passing a real Blob — or anything without `uri` — silently uploads the text
// "[object Blob]" instead of the image bytes, while still reporting success.
//
// It is not enough to hand a `{ uri, name, type }` object to supabase-js: only a
// real `FormData` takes the branch that serializes it as a file (see `formFile`
// below). So every storage upload in this app passes the `FormData` this helper
// builds. `mimeOf`/`nameOf` derive sensible defaults from the URI's extension
// when a caller has no better information.

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
 * A ready-to-upload `FormData` carrying one file part.
 *
 * This MUST be a real `FormData` instance, not the bare `{ uri, name, type }`
 * object. supabase-js picks its upload body like this:
 *
 *     if (body instanceof Blob)        -> new FormData().append("", body)
 *     else if (body instanceof FormData) -> send the FormData as-is
 *     else                              -> send the value raw
 *
 * A plain object is neither, so it falls into the last branch and `fetch`
 * stringifies it — the object's JSON (`{"uri":"file:///…","name":"…"}`) is what
 * lands in storage, just a few hundred bytes, while the upload still reports
 * success. RN's own `FormData.getParts()` is what understands the `uri`
 * attribute and reads the file from disk, so the object has to be appended.
 *
 * `uri` may also be an http(s) URL: RN's FormData uploads a remote URI directly
 * without downloading it first.
 */
export function formFile(uri: string, name?: string, type?: string): FormData {
  const form = new FormData();
  form.append(
    "file",
    {
      uri,
      name: name ?? nameOf(uri),
      type: type ?? mimeOf(uri),
    } as unknown as Blob,
  );
  return form;
}
