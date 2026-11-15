import { z } from 'zod';
import { ALL_ROLES, NOTIFICATION_TYPES, SEVERITY } from '../utils/constants.js';
import { dateString, objectId, optionalString, pagination, password } from './common.js';

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password,
  role: z.enum(ALL_ROLES),
  department: optionalString(60),
  assignedCategories: z.array(objectId).max(50).default([]),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema.omit({ password: true }).partial();

export const resetPasswordSchema = z.object({ password });

export const userListQuery = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  role: z.enum(ALL_ROLES).optional(),
});

const nullableNumber = (min, max) =>
  z.union([z.number().min(min).max(max), z.null()]).optional();

export const settingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    address: optionalString(300),
    phone: optionalString(40),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    settings: z
      .object({
        currency: z.string().trim().min(1).max(8),
        expiryWarningDays: z.number().int().min(1).max(365),
        expiryCriticalDays: z.number().int().min(1).max(90),
        forecastWindowDays: z.number().int().min(7).max(365),
        forecastHorizonDays: z.number().int().min(1).max(180),
        defaultOrderingCost: nullableNumber(0, 1e9),
        holdingCostRate: nullableNumber(0, 100),
        significantAdjustmentValue: z.number().min(0).max(1e9),
        defaultTaxRate: z.number().min(0).max(100),
      })
      .partial()
      .optional(),
  })
  .superRefine((d, ctx) => {
    const s = d.settings;
    if (s?.expiryCriticalDays && s?.expiryWarningDays && s.expiryCriticalDays > s.expiryWarningDays) {
      ctx.addIssue({ code: 'custom', path: ['settings', 'expiryCriticalDays'], message: 'Critical window must be shorter than the warning window' });
    }
  });

export const notificationListQuery = z.object({
  ...pagination,
  unread: z.enum(['true', 'false']).optional(),
  severity: z.enum(Object.values(SEVERITY)).optional(),
  type: z.enum(Object.values(NOTIFICATION_TYPES)).optional(),
  state: z.enum(['active', 'resolved', 'all']).default('all'),
});

export const auditListQuery = z.object({
  ...pagination,
  entityType: z.string().trim().max(40).optional(),
  action: z.string().trim().max(60).optional(),
  user: objectId.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});
