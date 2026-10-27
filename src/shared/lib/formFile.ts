// C:\OOTDify\src\shared\lib\formFile.ts
// One file part for a multipart upload, built from a local photo URI.
//
// Expo replaces the global `fetch` with `expo/fetch` (see
// node_modules/expo/src/winter/runtime.native.ts). Its FormData encoder only
// sends strings, Blobs and objects with `bytes()`; the old React Native
// `{ uri, name, type }` part makes it throw "Unsupported FormDataPart
// implementation" before any byte leaves the phone, which apiClient reports as
// a "network" failure while the server logs nothing.
//
// An expo-file-system `File` is a Blob with `bytes()` AND a `uri`, so both
// `expo/fetch` and React Native's own FormData (EXPO_PUBLIC_USE_RN_FETCH)
// read the real image from disk. Its name and MIME type come from the file.
//
// Only local files (file://, content://) work here. To re-upload a remote
// image, download its bytes and upload those instead.
import { File } from "expo-file-system";

/** A local file as a FormData part. */
export function uploadPart(uri: string): Blob {
  return new File(uri);
}

/**
 * A ready-to-upload `FormData` carrying one local file, for Supabase Storage.
 *
 * This MUST be a real `FormData`: supabase-js sends a FormData body as-is,
 * whereas any other object is stringified, so the object's JSON is what
 * would land in storage while the upload still reports success.
 */
export function formFile(uri: string): FormData {
  const form = new FormData();
  form.append("file", uploadPart(uri));
  return form;
}
