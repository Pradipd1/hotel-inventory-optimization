import { z } from 'zod';
import { password } from './common.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(100),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });
