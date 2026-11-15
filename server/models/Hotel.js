import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    currency: { type: String, default: 'NPR', trim: true, maxlength: 8 },
    expiryWarningDays: { type: Number, default: 30, min: 1, max: 365 },
    expiryCriticalDays: { type: Number, default: 7, min: 1, max: 90 },
    forecastWindowDays: { type: Number, default: 30, min: 7, max: 365 },
    forecastHorizonDays: { type: Number, default: 30, min: 1, max: 180 },
    // EOQ inputs. null = not configured -> EOQ is reported as "cannot be calculated".
    defaultOrderingCost: { type: Number, min: 0, default: null },
    holdingCostRate: { type: Number, min: 0, max: 100, default: null }, // % of unit cost per year
    significantAdjustmentValue: { type: Number, min: 0, default: 5000 },
    defaultTaxRate: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    address: { type: String, trim: true, maxlength: 300 },
    phone: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Hotel = mongoose.model('Hotel', hotelSchema);
