import mongoose from 'mongoose';

/** Item image stored in MongoDB (IMAGE_STORAGE=database), for hosts without a persistent disk. */
const imageFileSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

export const ImageFile = mongoose.model('ImageFile', imageFileSchema);
