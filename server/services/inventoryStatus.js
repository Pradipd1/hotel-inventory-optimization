import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { STOCK_STATUS } from '../utils/constants.js';
import { roundMoney } from '../utils/helpers.js';

/**
 * Primary stock status from quantities. Rule A of the optimization engine:
 * Current Stock <= Reorder Point  =>  Low Stock.
 */
export function computeStockStatus(item) {
  const stock = Number(item.currentStock) || 0;
  if (stock <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (stock <= (Number(item.reorderPoint) || 0)) return STOCK_STATUS.LOW_STOCK;
  if (item.maxStock > 0 && stock > item.maxStock) return STOCK_STATUS.OVERSTOCKED;
  return STOCK_STATUS.IN_STOCK;
}

/**
 * Expiry classification relative to the hotel's configured warning windows.
 * Returns { status: 'expired' | 'expiring_critical' | 'expiring_soon' | 'ok' | null, daysToExpiry }.
 */
export function computeExpiryStatus(item, settings = {}, now = new Date()) {
  if (!item.expiryDate) return { status: null, daysToExpiry: null };
  const warning = settings.expiryWarningDays ?? 30;
  const critical = settings.expiryCriticalDays ?? 7;
  const days = differenceInCalendarDays(new Date(item.expiryDate), now);
  let status = 'ok';
  if (days < 0) status = 'expired';
  else if (days <= critical) status = 'expiring_critical';
  else if (days <= warning) status = 'expiring_soon';
  return { status, daysToExpiry: days };
}

/** Adds computed fields used by the API and UI. */
export function decorateItem(item, settings) {
  const expiry = computeExpiryStatus(item, settings);
  return {
    ...item,
    stockStatus: computeStockStatus(item),
    expiryStatus: expiry.status,
    daysToExpiry: expiry.daysToExpiry,
    stockValue: roundMoney((item.currentStock || 0) * (item.unitCost || 0)),
  };
}

/** MongoDB filter for a stock/expiry status, so filtering and pagination happen in the database. */
export function statusFilter(status, settings = {}, now = new Date()) {
  const today = startOfDay(now);
  switch (status) {
    case STOCK_STATUS.OUT_OF_STOCK:
      return { currentStock: { $lte: 0 } };
    case STOCK_STATUS.LOW_STOCK:
      return { currentStock: { $gt: 0 }, $expr: { $lte: ['$currentStock', '$reorderPoint'] } };
    case STOCK_STATUS.OVERSTOCKED:
      return { $expr: { $and: [{ $gt: ['$maxStock', 0] }, { $gt: ['$currentStock', '$maxStock'] }] } };
    case STOCK_STATUS.IN_STOCK:
      return {
        $expr: {
          $and: [
            { $gt: ['$currentStock', '$reorderPoint'] },
            { $gt: ['$currentStock', 0] },
            { $or: [{ $lte: ['$maxStock', 0] }, { $lte: ['$currentStock', '$maxStock'] }] },
          ],
        },
      };
    case STOCK_STATUS.EXPIRING_SOON:
      return {
        currentStock: { $gt: 0 },
        expiryDate: { $gte: today, $lt: addDays(today, (settings.expiryWarningDays ?? 30) + 1) },
      };
    case STOCK_STATUS.EXPIRED:
      return { currentStock: { $gt: 0 }, expiryDate: { $lt: today } };
    default:
      return {};
  }
}
