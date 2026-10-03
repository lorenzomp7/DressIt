import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { config } from "../config.js";

export interface StoredImage {
  url: string;
  /** Cloudinary public_id or local relative path; used for deletion. */
  key: string;
}

export interface ImageStorage {
  save(userId: string, data: Buffer): Promise<StoredImage>;
  remove(key: string): Promise<void>;
}

/** Cloudinary reads credentials from CLOUDINARY_URL automatically. */
class CloudinaryStorage implements ImageStorage {
  constructor() {
    cloudinary.config({ secure: true });
  }

  save(userId: string, data: Buffer): Promise<StoredImage> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `dressit/${userId}`, resource_type: "image" },
        (err, result?: UploadApiResponse) => {
          if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
          resolve({ url: result.secure_url, key: result.public_id });
        },
      );
      stream.end(data);
    });
  }

  async remove(key: string): Promise<void> {
    await cloudinary.uploader.destroy(key);
  }
}

/**
 * Stores files on the local disk and serves them from /uploads.
 * NOTE: Render's filesystem is ephemeral — files vanish on every deploy/restart.
 * Fine for local dev and demos; use Cloudinary in production.
 */
class LocalStorage implements ImageStorage {
  readonly root = path.resolve(config.UPLOAD_DIR);

  async save(userId: string, data: Buffer): Promise<StoredImage> {
    const key = `${userId}/${randomUUID()}.jpg`;
    const target = path.join(this.root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return { url: `${config.publicApiUrl}/uploads/${key}`, key };
  }

  async remove(key: string): Promise<void> {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) return; // path traversal guard
    await unlink(target).catch(() => undefined);
  }
}

export const localStorage = new LocalStorage();
export const storage: ImageStorage = config.useCloudinary ? new CloudinaryStorage() : localStorage;
