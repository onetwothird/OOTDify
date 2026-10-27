// C:\OOTDify\src\shared\lib\shrinkImage.ts
// Downscale + re-encode a local photo before it is uploaded.
//
// Phone cameras produce 12–50 MP photos that can exceed the backend's 10 MB
// upload limit. An over-limit upload is rejected mid-stream, which React
// Native reports as a dropped connection ("Network request failed") rather
// than a readable error. Every model in the backend runs at <=640 px anyway,
// so 1600 px on the longest side loses nothing and uploads in a fraction of
// the time.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const MAX_UPLOAD_SIDE = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Returns the uri of a JPEG no larger than `maxSide` (default MAX_UPLOAD_SIDE)
 * on its longest side. Falls back to the original uri if the photo can't be
 * processed, so a manipulator failure never blocks an upload the backend
 * could still accept.
 */
export async function shrinkForUpload(uri: string, maxSide = MAX_UPLOAD_SIDE): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const original = await context.renderAsync();
    const longest = Math.max(original.width, original.height);
    let image = original;
    if (longest > maxSide) {
      context.resize(
        original.width >= original.height
          ? { width: maxSide }
          : { height: maxSide },
      );
      image = await context.renderAsync();
    }
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return saved.uri;
  } catch (e) {
    console.warn("[shrinkForUpload] could not downscale photo; uploading original:", e);
    return uri;
  }
}
