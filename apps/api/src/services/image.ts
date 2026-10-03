import sharp from "sharp";

export interface NormalizedImage {
  buffer: Buffer;
  mediaType: "image/jpeg";
}

/**
 * Auto-rotates (EXIF), strips metadata (GPS from phone cameras) and downsizes to a
 * size that is plenty for both display and Claude vision while keeping tokens low.
 */
export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  const buffer = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { buffer, mediaType: "image/jpeg" };
}
