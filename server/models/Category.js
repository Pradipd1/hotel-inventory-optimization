import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    color: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/, default: '#1e3a8a' },
  },
  { timestamps: true }
);

categorySchema.index({ hotelId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Category = mongoose.model('Category', categorySchema);
