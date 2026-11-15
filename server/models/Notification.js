import mongoose from 'mongoose';
import { ALL_ROLES, NOTIFICATION_TYPES, SEVERITY } from '../utils/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    severity: { type: String, enum: Object.values(SEVERITY), default: SEVERITY.INFO },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    link: { type: String, maxlength: 200 },
    roles: [{ type: String, enum: ALL_ROLES }], // which roles can see this notification
    // Condition alerts (low stock, expiry, ...) stay active until the condition clears.
    dedupeKey: { type: String, default: null },
    active: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

notificationSchema.index({ hotelId: 1, roles: 1, createdAt: -1 });
notificationSchema.index({ hotelId: 1, item: 1, active: 1 });
// At most one active alert per condition (prevents duplicate low-stock alerts, etc.).
notificationSchema.index(
  { hotelId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

export const Notification = mongoose.model('Notification', notificationSchema);
