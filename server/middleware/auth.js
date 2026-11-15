import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), hotelId: String(user.hotelId), role: user.role, tv: user.tokenVersion ?? 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' }
  );
}

/** Verifies the Bearer JWT and attaches the authenticated user (with hotel scope) to req.user. */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion').lean();
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is not active');
  if ((user.tokenVersion ?? 0) !== payload.tv) {
    throw ApiError.unauthorized('Session has been signed out. Please sign in again.');
  }

  req.user = {
    id: user._id,
    hotelId: user.hotelId,
    role: user.role,
    name: user.name,
    email: user.email,
    assignedCategories: user.assignedCategories || [],
  };
  next();
}

/** Role-based authorization. Usage: authorize(ROLES.ADMIN, ROLES.MANAGER) */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
}
