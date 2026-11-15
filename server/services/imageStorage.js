import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

let configured = false;
function client() {
  if (!configured) {
    // Configure explicitly from env (the SDK may be loaded before dotenv has read server/.env).
    // Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
    const u = new URL(env.cloudinaryUrl);
    cloudinary.config({
      cloud_name: u.hostname,
      api_key: decodeURIComponent(u.username),
      api_secret: decodeURIComponent(u.password),
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/** Uploads an image buffer to Cloudinary under a per-hotel folder. Returns { url, publicId }. */
export function uploadImageBuffer(buffer, hotelId) {
  return new Promise((resolve, reject) => {
    const stream = client().uploader.upload_stream(
      { folder: `hotel-inventory/${hotelId}`, resource_type: 'image', overwrite: false },
      (err, result) => {
        if (err || !result) return reject(new ApiError(502, `Image upload to Cloudinary failed: ${err?.message || 'no response'}`));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/** Best-effort removal of a replaced image; failures are logged, never shown to the user. */
export async function deleteImage(publicId) {
  if (!env.cloudinaryUrl || !publicId) return;
  try {
    await client().uploader.destroy(publicId);
  } catch (err) {
    console.warn(`Could not delete old Cloudinary image ${publicId}: ${err.message}`);
  }
}
