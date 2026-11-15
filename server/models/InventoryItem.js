import mongoose from 'mongoose';
import { UNITS } from '../utils/constants.js';

const inventoryItemSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    description: { type: String, trim: true, maxlength: 1000 },
    unit: { type: String, enum: UNITS, required: true },
    currentStock: { type: Number, default: 0, min: [0, 'Stock cannot be negative'] },
    minStock: { type: Number, default: 0, min: 0 },
    maxStock: { type: Number, default: 0, min: 0 }, // 0 = no maximum configured
    reorderPoint: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    location: { type: String, trim: true, maxlength: 100, default: 'Main Store' },
    expiryDate: { type: Date, default: null },
    image: { type: String, default: null },
    imagePublicId: { type: String, default: null, select: false }, // Cloudinary asset id, for replacing the image

    // Optimization parameters (null = not configured; the engine reports what it cannot compute).
    leadTimeDays: { type: Number, min: 0, max: 365, default: null }, // overrides supplier lead time
    safetyStock: { type: Number, min: 0, default: null },
    orderingCost: { type: Number, min: 0, default: null }, // S: cost per order
    holdingCostPerUnit: { type: Number, min: 0, default: null }, // H: annual holding cost per unit

    isArchived: { type: Boolean, default: false },
    archivedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// SKU is unique per hotel among non-archived items.
inventoryItemSchema.index(
  { hotelId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);
inventoryItemSchema.index({ hotelId: 1, isArchived: 1, category: 1 });
inventoryItemSchema.index({ hotelId: 1, isArchived: 1, name: 1 });
inventoryItemSchema.index({ hotelId: 1, expiryDate: 1 });
inventoryItemSchema.index({ hotelId: 1, supplier: 1 });

export const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);
