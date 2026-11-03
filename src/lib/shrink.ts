import { MAX_IMAGE_BYTES } from "./safety.ts";

/** Longest edge of a reduced copy: the detector reads pixels, and 2048 px keeps the details it needs. */
export const SHRINK_EDGE = 2048;

/**
 * A photo the check cannot take as it is (over 5 MB, or a format Chrome reads but the API does
 * not, such as AVIF) becomes a JPEG of at most 2048 px, made here in the panel; nothing leaves
 * before the click. The copy keeps the pixels, not the file's EXIF, C2PA or generator tags, which
 * the panel says. Null when Chrome cannot decode the file or no quality fits under 5 MB.
 */
export async function shrinkImage(file: Blob & { name?: string }, edge = SHRINK_EDGE): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (blob.size && blob.size <= MAX_IMAGE_BYTES) {
        return new File([blob], `${(file.name || "image").replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
      }
    }
    return null;
  } catch {
    return null;
  }
}
