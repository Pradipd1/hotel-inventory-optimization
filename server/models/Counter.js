import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // `${hotelId}:${prefix}:${year}`
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model('Counter', counterSchema);

/** Atomically generates the next sequential reference, e.g. PO-2026-0007. */
export async function nextReference(hotelId, prefix, pad = 4) {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `${hotelId}:${prefix}:${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${year}-${String(counter.seq).padStart(pad, '0')}`;
}
