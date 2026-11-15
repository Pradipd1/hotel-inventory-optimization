import mongoose from 'mongoose';

/**
 * One record per consumption (Stock Out). Kept separate from StockMovement so the
 * forecasting engine reads only genuine demand, not wastage, transfers or adjustments.
 */
const consumptionRecordSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    department: { type: String, trim: true, maxlength: 60 },
    date: { type: Date, required: true },
    movement: { type: mongoose.Schema.Types.ObjectId, ref: 'StockMovement' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

consumptionRecordSchema.index({ hotelId: 1, item: 1, date: -1 });
consumptionRecordSchema.index({ hotelId: 1, date: -1 });

export const ConsumptionRecord = mongoose.model('ConsumptionRecord', consumptionRecordSchema);
