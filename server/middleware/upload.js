import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// With Cloudinary configured the file is kept in memory and streamed to Cloudinary;
// otherwise it is written to the local uploads folder.
const storage = env.cloudinaryUrl
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: env.uploadDir,
      // Random file names: the client-supplied name is never used on disk.
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype]}`),
    });

export const imageUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(new ApiError(400, 'Only JPG, PNG or WebP images are allowed'));
    cb(null, true);
  },
}).single('image');
