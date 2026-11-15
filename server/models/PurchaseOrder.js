import mongoose from 'mongoose';
import { ALL_PO_STATUS, PO_STATUS } from '../utils/constants.js';

const lineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  itemName: { type: String, required: true },
  sku: { type: String, required: true },
  unit: { type: String },
  quantity: { type: Number, required: true, min: 0.001 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  receivedQuantity: { type: Number, default: 0, min: 0 },
});

const receiptSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receivedByName: String,
  notes: String,
  lines: [
    {
      _id: false,
      lineId: mongoose.Schema.Types.ObjectId,
      item: mongoose.Schema.Types.ObjectId,
      itemName: String,
      quantity: Number,
    },
  ],
});

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ALL_PO_STATUS },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    note: String,
  },
  { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    poNumber: { type: String, required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: {
      type: [lineSchema],
      validate: [(v) => v.length > 0, 'A purchase order needs at least one item'],
    },
    subtotal: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ALL_PO_STATUS, default: PO_STATUS.DRAFT },
    notes: { type: String, trim: true, maxlength: 2000 },
    expectedDeliveryDate: Date,
    source: { type: String, enum: ['manual', 'optimization'], default: 'manual' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    orderedAt: Date,
    receivedAt: Date,
    cancelledAt: Date,
    statusHistory: [historySchema],
    receipts: [receiptSchema],
  },
  // optimisticConcurrency: concurrent saves of the same PO fail with a VersionError,
  // which (together with receipt idempotency keys) prevents double-receiving stock.
  { timestamps: true, optimisticConcurrency: true }
);

purchaseOrderSchema.index({ hotelId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ hotelId: 1, status: 1, createdAt: -1 });
purchaseOrderSchema.index({ hotelId: 1, supplier: 1, createdAt: -1 });
purchaseOrderSchema.index({ hotelId: 1, 'receipts.idempotencyKey': 1 });

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
