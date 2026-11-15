import { Hotel, InventoryItem, Notification } from '../models/index.js';
import { NOTIFICATION_TYPES as T, ROLES, SEVERITY, STOCK_STATUS } from '../utils/constants.js';
import { computeExpiryStatus, computeStockStatus } from './inventoryStatus.js';

const STOCK_ALERT_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF];
const MANAGEMENT_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
const CONDITION_TYPES = [T.OUT_OF_STOCK, T.LOW_STOCK, T.OVERSTOCK, T.EXPIRED, T.EXPIRING_CRITICAL, T.EXPIRING_SOON];

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Works out which alert conditions currently apply to an item. */
export function itemAlertConditions(item, settings = {}) {
  const conditions = [];
  const stockStatus = computeStockStatus(item);
  const u = item.unit;

  if (stockStatus === STOCK_STATUS.OUT_OF_STOCK) {
    conditions.push({
      type: T.OUT_OF_STOCK,
      severity: SEVERITY.CRITICAL,
      roles: STOCK_ALERT_ROLES,
      title: `${item.name} is out of stock`,
      message: `${item.name} (${item.sku}) has 0 ${u} left. Reorder point is ${fmt(item.reorderPoint)} ${u}.`,
    });
  } else if (stockStatus === STOCK_STATUS.LOW_STOCK) {
    conditions.push({
      type: T.LOW_STOCK,
      severity: SEVERITY.WARNING,
      roles: STOCK_ALERT_ROLES,
      title: `Low stock: ${item.name}`,
      message: `${item.name} has ${fmt(item.currentStock)} ${u}, at or below its reorder point of ${fmt(item.reorderPoint)} ${u}.`,
    });
  } else if (stockStatus === STOCK_STATUS.OVERSTOCKED) {
    conditions.push({
      type: T.OVERSTOCK,
      severity: SEVERITY.INFO,
      roles: MANAGEMENT_ROLES,
      title: `Overstocked: ${item.name}`,
      message: `${item.name} has ${fmt(item.currentStock)} ${u}, above the maximum of ${fmt(item.maxStock)} ${u}. Consider reducing future purchases.`,
    });
  }

  if (item.currentStock > 0) {
    const { status, daysToExpiry } = computeExpiryStatus(item, settings);
    if (status === 'expired') {
      conditions.push({
        type: T.EXPIRED,
        severity: SEVERITY.CRITICAL,
        roles: STOCK_ALERT_ROLES,
        title: `Expired: ${item.name}`,
        message: `${fmt(item.currentStock)} ${u} of ${item.name} expired ${Math.abs(daysToExpiry)} day(s) ago. Remove from use and record wastage.`,
      });
    } else if (status === 'expiring_critical') {
      conditions.push({
        type: T.EXPIRING_CRITICAL,
        severity: SEVERITY.CRITICAL,
        roles: STOCK_ALERT_ROLES,
        title: `${item.name} expires in ${daysToExpiry} day(s)`,
        message: `${fmt(item.currentStock)} ${u} of ${item.name} expires within ${settings.expiryCriticalDays ?? 7} days. Use first or redistribute.`,
      });
    } else if (status === 'expiring_soon') {
      conditions.push({
        type: T.EXPIRING_SOON,
        severity: SEVERITY.WARNING,
        roles: STOCK_ALERT_ROLES,
        title: `${item.name} expires in ${daysToExpiry} days`,
        message: `${fmt(item.currentStock)} ${u} of ${item.name} expires within ${settings.expiryWarningDays ?? 30} days.`,
      });
    }
  }
  return conditions;
}

/**
 * Syncs condition alerts for one item: opens an alert when a condition starts (one active
 * alert per condition, enforced by a unique partial index) and resolves it when it clears.
 */
export async function evaluateItemAlerts(item, settings = {}) {
  const conditions = item.isArchived ? [] : itemAlertConditions(item, settings);
  const activeTypes = conditions.map((c) => c.type);
  const now = new Date();

  await Notification.updateMany(
    { hotelId: item.hotelId, item: item._id, active: true, type: { $in: CONDITION_TYPES.filter((t) => !activeTypes.includes(t)) } },
    { $set: { active: false, resolvedAt: now } }
  );

  for (const c of conditions) {
    const dedupeKey = `${c.type}:${item._id}`;
    try {
      await Notification.updateOne(
        { hotelId: item.hotelId, dedupeKey, active: true },
        {
          $setOnInsert: {
            hotelId: item.hotelId,
            dedupeKey,
            active: true,
            type: c.type,
            severity: c.severity,
            roles: c.roles,
            title: c.title,
            message: c.message,
            item: item._id,
            link: `/inventory/${item._id}`,
            resolvedAt: null,
            readBy: [],
          },
        },
        { upsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err; // a concurrent request already opened this alert
    }
  }
  return conditions;
}

/** Full scan for one hotel (expiry changes with the calendar, not only with stock movements). */
export async function scanHotelAlerts(hotelId) {
  const hotel = await Hotel.findById(hotelId).lean();
  const items = await InventoryItem.find({ hotelId }).lean();
  let opened = 0;
  for (const item of items) {
    opened += (await evaluateItemAlerts(item, hotel?.settings)).length;
  }
  return { itemsScanned: items.length, activeConditions: opened };
}

export async function scanAllHotels() {
  const hotels = await Hotel.find({ isActive: true }).select('_id').lean();
  for (const h of hotels) await scanHotelAlerts(h._id);
}

export async function notifySignificantAdjustment(movement, settings = {}) {
  const threshold = settings.significantAdjustmentValue ?? 5000;
  const pct = movement.balanceBefore > 0 ? Math.abs(movement.change) / movement.balanceBefore : 1;
  if (movement.totalValue < threshold && pct < 0.25) return null;
  const sign = movement.change > 0 ? '+' : '−';
  return Notification.create({
    hotelId: movement.hotelId,
    type: T.STOCK_ADJUSTMENT,
    severity: SEVERITY.WARNING,
    roles: MANAGEMENT_ROLES,
    title: `Significant stock adjustment: ${movement.itemName}`,
    message: `${movement.performedByName} adjusted ${movement.itemName} by ${sign}${fmt(movement.quantity)} ${movement.unit} (${fmt(movement.balanceBefore)} → ${fmt(movement.balanceAfter)}). Reason: ${movement.reason || 'not given'}.`,
    item: movement.item,
    link: `/inventory/${movement.item}`,
  });
}

/** PO approval request: one active alert per PO for admins, resolved when the PO leaves pending. */
export async function openPoApprovalAlert(po, createdByName) {
  const dedupeKey = `po_pending:${po._id}`;
  try {
    await Notification.updateOne(
      { hotelId: po.hotelId, dedupeKey, active: true },
      {
        $setOnInsert: {
          hotelId: po.hotelId,
          dedupeKey,
          active: true,
          type: T.PO_PENDING_APPROVAL,
          severity: SEVERITY.WARNING,
          roles: [ROLES.ADMIN],
          title: `Purchase order ${po.poNumber} awaits approval`,
          message: `${createdByName} submitted ${po.poNumber} (${po.items.length} item(s), total ${fmt(po.total)}) for approval.`,
          purchaseOrder: po._id,
          link: `/purchase-orders/${po._id}`,
          resolvedAt: null,
          readBy: [],
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

export async function resolvePoApprovalAlert(po) {
  await Notification.updateMany(
    { hotelId: po.hotelId, dedupeKey: `po_pending:${po._id}`, active: true },
    { $set: { active: false, resolvedAt: new Date() } }
  );
}

export async function notifyPoStatus(po, title, message, severity = SEVERITY.INFO) {
  return Notification.create({
    hotelId: po.hotelId,
    type: T.PO_STATUS,
    severity,
    roles: MANAGEMENT_ROLES,
    title,
    message,
    purchaseOrder: po._id,
    link: `/purchase-orders/${po._id}`,
  });
}
