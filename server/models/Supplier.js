import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    companyName: { type: String, trim: true, maxlength: 150 },
    contactPerson: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 300 },
    paymentTerms: { type: String, trim: true, maxlength: 100 },
    leadTimeDays: { type: Number, min: 0, max: 365, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

supplierSchema.index({ hotelId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
supplierSchema.index({ hotelId: 1, status: 1 });

export const Supplier = mongoose.model('Supplier', supplierSchema);
