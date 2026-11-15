import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

export const optionalString = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** Optional non-negative number that accepts null / '' to mean "not configured". */
export const nullableNonNegative = z
  .union([z.number().min(0), z.null(), z.literal('')])
  .optional()
  .transform((v) => (v === '' ? null : v));

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
};

export const dateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
