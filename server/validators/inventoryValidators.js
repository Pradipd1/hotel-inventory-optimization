import { z } from 'zod';
import { ALL_MOVEMENT_TYPES, MOVEMENT_TYPES, STOCK_STATUS, UNITS } from '../utils/constants.js';
import { dateString, nullableNonNegative, objectId, optionalString, pagination } from './common.js';

// ---------- Categories ----------
export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: optionalString(300),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1e3a8a').optional(),
});

// ---------- Inventory items ----------
const qty = z.number({ invalid_type_error: 'Must be a number' }).min(0, 'Cannot be negative');

const itemFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'SKU may contain letters, numbers, - and _ only')
    .transform((v) => v.toUpperCase()),
  category: objectId,
  description: optionalString(1000),
  unit: z.enum(UNITS),
  minStock: qty.default(0),
  maxStock: qty.default(0),
  reorderPoint: qty.default(0),
  unitCost: qty,
  supplier: z
    .union([objectId, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  location: optionalString(100),
  expiryDate: z
    .union([dateString, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : new Date(v))),
  leadTimeDays: nullableNonNegative,
  safetyStock: nullableNonNegative,
  orderingCost: nullableNonNegative,
  holdingCostPerUnit: nullableNonNegative,
};

/** Cross-field rules: min <= max, reorder point <= max (when a maximum is configured). */
export function checkStockLevels(data, ctx) {
  const { minStock, maxStock, reorderPoint } = data;
  if (maxStock > 0 && minStock != null && minStock > maxStock) {
    ctx.addIssue({ code: 'custom', path: ['minStock'], message: 'Minimum stock cannot exceed maximum stock' });
  }
  if (maxStock > 0 && reorderPoint != null && reorderPoint > maxStock) {
    ctx.addIssue({ code: 'custom', path: ['reorderPoint'], message: 'Reorder point cannot exceed maximum stock' });
  }
}

export const createItemSchema = z
  .object({ ...itemFields, openingStock: qty.default(0) })
  .superRefine(checkStockLevels);

// currentStock is intentionally absent: stock only changes through stock movements.
export const updateItemSchema = z.object(itemFields).partial();

export const itemListQuery = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  category: objectId.optional(),
  supplier: objectId.optional(),
  status: z.enum(Object.values(STOCK_STATUS)).optional(),
  sort: z.enum(['name', 'sku', 'currentStock', 'unitCost', 'expiryDate', 'updatedAt', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ---------- Stock movements ----------
export const createMovementSchema = z
  .object({
    itemId: objectId,
    type: z.enum(ALL_MOVEMENT_TYPES),
    quantity: z.number({ invalid_type_error: 'Quantity must be a number' }).positive('Quantity must be greater than zero').max(1e7),
    direction: z.enum(['increase', 'decrease']).optional(),
    reason: optionalString(500),
    referenceNo: optionalString(60),
    department: optionalString(60),
    toLocation: optionalString(100),
    unitCost: z.number().min(0).optional(),
    occurredAt: dateString.optional(),
  })
  .superRefine((d, ctx) => {
    const needsDirection = [MOVEMENT_TYPES.ADJUSTMENT, MOVEMENT_TYPES.RETURN].includes(d.type);
    if (needsDirection && !d.direction) {
      ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Choose whether stock increases or decreases' });
    }
    const needsReason = [MOVEMENT_TYPES.ADJUSTMENT, MOVEMENT_TYPES.WASTAGE, MOVEMENT_TYPES.RETURN].includes(d.type);
    if (needsReason && !d.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required for this movement type' });
    }
    if (d.type === MOVEMENT_TYPES.TRANSFER && !d.toLocation) {
      ctx.addIssue({ code: 'custom', path: ['toLocation'], message: 'Destination location is required' });
    }
    if (d.occurredAt && new Date(d.occurredAt) > new Date(Date.now() + 5 * 60 * 1000)) {
      ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'Date cannot be in the future' });
    }
  });

export const movementListQuery = z.object({
  ...pagination,
  item: objectId.optional(),
  category: objectId.optional(),
  type: z.enum(ALL_MOVEMENT_TYPES).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  search: z.string().trim().max(100).optional(),
});
