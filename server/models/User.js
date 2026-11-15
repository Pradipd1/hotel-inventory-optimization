import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ALL_ROLES } from '../utils/constants.js';
import { env } from '../config/env.js';

const userSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ALL_ROLES, required: true },
    department: { type: String, trim: true, maxlength: 60 },
    // Staff can be limited to specific categories ("assigned inventory"). Empty = all categories.
    assignedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    // Incremented on logout / password change to invalidate previously issued JWTs.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, env.bcryptRounds);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model('User', userSchema);
