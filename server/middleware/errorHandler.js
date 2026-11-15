import mongoose from 'mongoose';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err instanceof mongoose.Error.VersionError) {
    status = 409;
    message = 'This record was changed by someone else. Refresh and try again.';
  } else if (err?.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || err.keyPattern || {}).filter((k) => k !== 'hotelId')[0];
    message = field ? `A record with this ${field} already exists` : 'Duplicate record';
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB)' : err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  }

  if (status >= 500 && !env.isTest) console.error(err);

  const body = { success: false, message };
  if (details) body.details = details;
  if (status >= 500 && !env.isProduction && err?.message) body.debug = err.message;
  res.status(status).json(body);
}
