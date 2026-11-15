import { Hotel, User } from '../models/index.js';
import { signToken } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from '../services/auditService.js';

async function buildProfile(userId) {
  const user = await User.findById(userId).populate('assignedCategories', 'name').lean();
  const hotel = await Hotel.findById(user.hotelId).lean();
  delete user.password;
  delete user.tokenVersion;
  return {
    ...user,
    hotel: hotel && { id: hotel._id, name: hotel.name, code: hotel.code, settings: hotel.settings },
  };
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password +tokenVersion');
  // Same message for unknown email and wrong password (no account enumeration).
  const valid = user && (await user.comparePassword(password));
  if (!valid) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const hotel = await Hotel.findById(user.hotelId).lean();
  if (!hotel?.isActive) throw ApiError.forbidden('This hotel account is not active');

  user.lastLoginAt = new Date();
  await user.save();

  req.user = { id: user._id, hotelId: user.hotelId, role: user.role, name: user.name };
  await audit(req, { action: 'auth.login', entityType: 'User', entityId: user._id, summary: `${user.name} signed in` });

  res.json({ success: true, token: signToken(user), user: await buildProfile(user._id) });
}

export async function me(req, res) {
  res.json({ success: true, user: await buildProfile(req.user.id) });
}

export async function logout(req, res) {
  // Invalidates every token issued to this user so far.
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  await audit(req, { action: 'auth.logout', entityType: 'User', entityId: req.user.id, summary: `${req.user.name} signed out` });
  res.json({ success: true, message: 'Signed out' });
}

export async function changePassword(req, res) {
  const user = await User.findById(req.user.id).select('+password +tokenVersion');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = req.body.newPassword;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  await audit(req, { action: 'auth.change_password', entityType: 'User', entityId: user._id, summary: 'Password changed' });
  res.json({ success: true, message: 'Password updated', token: signToken(user) });
}
