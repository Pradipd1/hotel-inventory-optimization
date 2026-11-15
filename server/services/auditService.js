import { AuditLog } from '../models/index.js';

/**
 * Records an audit entry for an important operation. Failures are logged but never
 * break the business operation that triggered them.
 */
export async function audit(req, { action, entityType, entityId, summary, metadata }) {
  try {
    await AuditLog.create({
      hotelId: req.user.hotelId,
      user: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action,
      entityType,
      entityId,
      summary,
      metadata,
      ip: req.ip,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
