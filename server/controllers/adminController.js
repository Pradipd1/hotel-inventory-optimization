import { AuditLog, Category, Hotel, Notification, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, pageMeta, paginate } from '../utils/helpers.js';
import { audit } from '../services/auditService.js';
import { scanHotelAlerts } from '../services/alertService.js';

// ---------- Users (admin) ----------
async function assertCategories(hotelId, ids = []) {
  if (!ids.length) return;
  const n = await Category.countDocuments({ hotelId, _id: { $in: ids } });
  if (n !== new Set(ids.map(String)).size) throw ApiError.badRequest('One or more assigned categories were not found');
}

export async function listUsers(req, res) {
  const q = req.validated.query;
  const { page, limit, skip } = paginate(q);
  const filter = { hotelId: req.user.hotelId };
  if (q.role) filter.role = q.role;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { department: rx }];
  }
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip(skip).limit(limit).populate('assignedCategories', 'name').lean(),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, { page, limit }) });
}

export async function createUser(req, res) {
  await assertCategories(req.user.hotelId, req.body.assignedCategories);
  if (await User.exists({ email: req.body.email })) throw ApiError.conflict('A user with this email already exists');
  const user = await User.create({ ...req.body, hotelId: req.user.hotelId });
  await audit(req, { action: 'user.create', entityType: 'User', entityId: user._id, summary: `Created ${user.role} account for ${user.email}` });
  res.status(201).json({ success: true, data: user, message: 'User created' });
}

export async function updateUser(req, res) {
  const { id } = req.validated.params;
  const user = await User.findOne({ _id: id, hotelId: req.user.hotelId }).select('+tokenVersion');
  if (!user) throw ApiError.notFound('User not found');
  const isSelf = String(user._id) === String(req.user.id);
  if (isSelf && (req.body.role && req.body.role !== user.role)) throw ApiError.badRequest('You cannot change your own role');
  if (isSelf && req.body.isActive === false) throw ApiError.badRequest('You cannot deactivate your own account');
  if (req.body.email && req.body.email !== user.email && (await User.exists({ email: req.body.email }))) {
    throw ApiError.conflict('A user with this email already exists');
  }
  await assertCategories(req.user.hotelId, req.body.assignedCategories);
  const roleOrStatusChanged = (req.body.role && req.body.role !== user.role) || (req.body.isActive === false && user.isActive);
  user.set(req.body);
  if (roleOrStatusChanged) user.tokenVersion += 1; // force re-login with new permissions
  await user.save();
  await audit(req, { action: 'user.update', entityType: 'User', entityId: user._id, summary: `Updated user ${user.email}`, metadata: { fields: Object.keys(req.body) } });
  res.json({ success: true, data: user, message: 'User updated' });
}

export async function resetUserPassword(req, res) {
  const user = await User.findOne({ _id: req.validated.params.id, hotelId: req.user.hotelId }).select('+tokenVersion');
  if (!user) throw ApiError.notFound('User not found');
  user.password = req.body.password;
  user.tokenVersion += 1;
  await user.save();
  await audit(req, { action: 'user.reset_password', entityType: 'User', entityId: user._id, summary: `Reset password for ${user.email}` });
  res.json({ success: true, message: 'Password reset. The user must sign in again.' });
}

export async function deleteUser(req, res) {
  const { id } = req.validated.params;
  if (String(id) === String(req.user.id)) throw ApiError.badRequest('You cannot delete your own account');
  const user = await User.findOne({ _id: id, hotelId: req.user.hotelId });
  if (!user) throw ApiError.notFound('User not found');
  // Users referenced by stock history are deactivated instead of deleted, to keep the audit trail.
  user.isActive = false;
  await user.save();
  await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
  await audit(req, { action: 'user.deactivate', entityType: 'User', entityId: user._id, summary: `Deactivated ${user.email}` });
  res.json({ success: true, message: `${user.name} has been deactivated. Their history is retained.` });
}

// ---------- Hotel settings (admin) ----------
export async function getSettings(req, res) {
  const hotel = await Hotel.findById(req.user.hotelId).lean();
  res.json({ success: true, data: hotel });
}

export async function updateSettings(req, res) {
  const hotel = await Hotel.findById(req.user.hotelId);
  const { settings, ...profile } = req.body;
  hotel.set(profile);
  if (settings) {
    const merged = { ...hotel.settings.toObject(), ...settings };
    if (merged.expiryCriticalDays > merged.expiryWarningDays) {
      throw ApiError.badRequest('Validation failed', [{ field: 'settings.expiryCriticalDays', message: 'Critical window must be shorter than the warning window' }]);
    }
    hotel.settings = merged;
  }
  await hotel.save();
  // Expiry windows may have changed, so re-evaluate all alerts.
  await scanHotelAlerts(hotel._id);
  await audit(req, { action: 'settings.update', entityType: 'Hotel', entityId: hotel._id, summary: 'Updated hotel inventory settings', metadata: req.body });
  res.json({ success: true, data: hotel, message: 'Settings saved' });
}

// ---------- Notifications ----------
function notificationScope(req) {
  return { hotelId: req.user.hotelId, roles: req.user.role };
}

export async function listNotifications(req, res) {
  const q = req.validated.query;
  const { page, limit, skip } = paginate(q);
  const filter = notificationScope(req);
  if (q.unread === 'true') filter.readBy = { $ne: req.user.id };
  if (q.severity) filter.severity = q.severity;
  if (q.type) filter.type = q.type;
  if (q.state === 'active') filter.active = true;
  if (q.state === 'resolved') filter.resolvedAt = { $ne: null };
  const [rows, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...notificationScope(req), readBy: { $ne: req.user.id } }),
  ]);
  const me = String(req.user.id);
  res.json({
    success: true,
    data: rows.map(({ readBy, ...n }) => ({ ...n, isRead: readBy.some((u) => String(u) === me) })),
    meta: { ...pageMeta(total, { page, limit }), unread },
  });
}

export async function unreadCount(req, res) {
  const scope = notificationScope(req);
  const [unread, critical] = await Promise.all([
    Notification.countDocuments({ ...scope, readBy: { $ne: req.user.id } }),
    Notification.countDocuments({ ...scope, readBy: { $ne: req.user.id }, severity: 'critical', active: true }),
  ]);
  res.json({ success: true, data: { unread, critical } });
}

export async function markRead(req, res) {
  const result = await Notification.updateOne({ _id: req.validated.params.id, ...notificationScope(req) }, { $addToSet: { readBy: req.user.id } });
  if (!result.matchedCount) throw ApiError.notFound('Notification not found');
  res.json({ success: true, message: 'Marked as read' });
}

export async function markUnread(req, res) {
  const result = await Notification.updateOne({ _id: req.validated.params.id, ...notificationScope(req) }, { $pull: { readBy: req.user.id } });
  if (!result.matchedCount) throw ApiError.notFound('Notification not found');
  res.json({ success: true, message: 'Marked as unread' });
}

export async function markAllRead(req, res) {
  const result = await Notification.updateMany({ ...notificationScope(req), readBy: { $ne: req.user.id } }, { $addToSet: { readBy: req.user.id } });
  res.json({ success: true, message: `${result.modifiedCount} notification(s) marked as read` });
}

export async function scanAlerts(req, res) {
  const result = await scanHotelAlerts(req.user.hotelId);
  res.json({ success: true, data: result, message: `Scanned ${result.itemsScanned} items` });
}

// ---------- Audit logs (admin) ----------
export async function listAuditLogs(req, res) {
  const q = req.validated.query;
  const { page, limit, skip } = paginate(q);
  const filter = { hotelId: req.user.hotelId };
  if (q.entityType) filter.entityType = q.entityType;
  if (q.action) filter.action = new RegExp(`^${escapeRegex(q.action)}`);
  if (q.user) filter.user = q.user;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(`${q.to.slice(0, 10)}T23:59:59.999`);
  }
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, { page, limit }) });
}
