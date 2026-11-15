import mongoose from 'mongoose';
import { ALL_MOVEMENT_TYPES } from '../utils/constants.js';

const stockMovementSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    itemName: { type: String, required: true },
    sku: { type: String, required: true },
    unit: { type: String },
    type: { type: String, enum: ALL_MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true, min: 0 }, // absolute quantity moved
    change: { type: Number, required: true }, // signed effect on stock (0 for transfers)
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    totalValue: { type: Number, default: 0 },
    reason: { type: String, trim: true, maxlength: 500 },
    referenceNo: { type: String, required: true, trim: true, maxlength: 60 },
    department: { type: String, trim: true, maxlength: 60 },
    fromLocation: { type: String, trim: true, maxlength: 100 },
    toLocation: { type: String, trim: true, maxlength: 100 },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedByName: { type: String },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

stockMovementSchema.index({ hotelId: 1, occurredAt: -1 });
stockMovementSchema.index({ hotelId: 1, item: 1, occurredAt: -1 });
stockMovementSchema.index({ hotelId: 1, item: 1, createdAt: -1 });
stockMovementSchema.index({ hotelId: 1, type: 1, occurredAt: -1 });
stockMovementSchema.index({ hotelId: 1, purchaseOrder: 1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
