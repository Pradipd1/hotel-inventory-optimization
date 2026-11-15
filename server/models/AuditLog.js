import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    userRole: String,
    action: { type: String, required: true, maxlength: 60 }, // e.g. item.create, po.approve
    entityType: { type: String, required: true, maxlength: 40 },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    summary: { type: String, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ hotelId: 1, createdAt: -1 });
auditLogSchema.index({ hotelId: 1, entityType: 1, entityId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
