import { format, startOfMonth, subDays, subMonths } from 'date-fns';
import { Category, ConsumptionRecord, Hotel, InventoryItem, PurchaseOrder, StockMovement } from '../models/index.js';
import { MOVEMENT_TYPES, OPEN_PO_STATUS, PO_STATUS, STOCK_STATUS } from '../utils/constants.js';
import { roundMoney } from '../utils/helpers.js';
import { decorateItem } from './inventoryStatus.js';

export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Last `count` month keys (yyyy-MM), oldest first, so charts show months with zero activity too. */
export function monthKeys(now, count) {
  return Array.from({ length: count }, (_, i) => format(subMonths(startOfMonth(now), count - 1 - i), 'yyyy-MM'));
}

/** Sum of movement value/quantity per month and type. */
export async function monthlyMovementTotals(hotelId, from, match = {}) {
  const rows = await StockMovement.aggregate([
    { $match: { hotelId, occurredAt: { $gte: from }, ...match } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$occurredAt', timezone: TIMEZONE } }, type: '$type', fromPo: { $ne: ['$purchaseOrder', null] } },
        value: { $sum: '$totalValue' },
        quantity: { $sum: '$quantity' },
        count: { $sum: 1 },
      },
    },
  ]);
  return rows;
}

export async function getDashboard(hotelId, now = new Date()) {
  const hotel = await Hotel.findById(hotelId).lean();
  const settings = hotel?.settings || {};
  const monthStart = startOfMonth(now);
  const sixMonthsStart = startOfMonth(subMonths(now, 5));
  const months = monthKeys(now, 6);
  const currentMonth = format(now, 'yyyy-MM');

  const [rawItems, categoryCount, poCounts, monthly, topConsumed, recentMovements, recentOrders] = await Promise.all([
    InventoryItem.find({ hotelId, isArchived: false }).populate('category', 'name color').populate('supplier', 'name').lean(),
    Category.countDocuments({ hotelId }),
    PurchaseOrder.aggregate([{ $match: { hotelId } }, { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } }]),
    monthlyMovementTotals(hotelId, sixMonthsStart, { type: { $in: [MOVEMENT_TYPES.OUT, MOVEMENT_TYPES.IN, MOVEMENT_TYPES.WASTAGE] } }),
    ConsumptionRecord.aggregate([
      { $match: { hotelId, date: { $gte: subDays(now, 30) } } },
      { $group: { _id: '$item', quantity: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$unitCost'] } } } },
      { $sort: { value: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'inventoryitems', localField: '_id', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      { $project: { _id: 0, itemId: '$_id', name: '$item.name', unit: '$item.unit', quantity: 1, value: 1 } },
    ]),
    StockMovement.find({ hotelId }).sort({ occurredAt: -1, _id: -1 }).limit(8).lean(),
    PurchaseOrder.find({ hotelId }).sort({ createdAt: -1 }).limit(5).select('poNumber status total createdAt supplier').populate('supplier', 'name').lean(),
  ]);

  const items = rawItems.map((i) => decorateItem(i, settings));
  const count = (pred) => items.filter(pred).length;
  const poByStatus = Object.fromEntries(poCounts.map((p) => [p._id, p]));

  const monthValue = (type, month, { fromPo } = {}) =>
    roundMoney(
      monthly
        .filter((r) => r._id.type === type && r._id.month === month && (fromPo === undefined || r._id.fromPo === fromPo))
        .reduce((s, r) => s + r.value, 0)
    );

  // Category breakdown by stock value.
  const catMap = new Map();
  for (const i of items) {
    const key = String(i.category?._id);
    const entry = catMap.get(key) || { name: i.category?.name ?? 'Uncategorised', color: i.category?.color, value: 0, items: 0 };
    entry.value += i.stockValue;
    entry.items += 1;
    catMap.set(key, entry);
  }

  const lowStockItems = items
    .filter((i) => [STOCK_STATUS.LOW_STOCK, STOCK_STATUS.OUT_OF_STOCK].includes(i.stockStatus))
    .sort((a, b) => a.currentStock / (a.reorderPoint || 1) - b.currentStock / (b.reorderPoint || 1));

  return {
    currency: settings.currency || 'NPR',
    kpis: {
      totalItems: items.length,
      totalCategories: categoryCount,
      totalStockValue: roundMoney(items.reduce((s, i) => s + i.stockValue, 0)),
      lowStock: count((i) => i.stockStatus === STOCK_STATUS.LOW_STOCK),
      outOfStock: count((i) => i.stockStatus === STOCK_STATUS.OUT_OF_STOCK),
      overstocked: count((i) => i.stockStatus === STOCK_STATUS.OVERSTOCKED),
      expiringSoon: count((i) => i.currentStock > 0 && ['expiring_soon', 'expiring_critical'].includes(i.expiryStatus)),
      expired: count((i) => i.currentStock > 0 && i.expiryStatus === 'expired'),
      pendingPurchaseOrders: OPEN_PO_STATUS.reduce((s, st) => s + (poByStatus[st]?.count ?? 0), 0),
      awaitingApproval: poByStatus[PO_STATUS.PENDING_APPROVAL]?.count ?? 0,
      monthlyConsumptionValue: monthValue(MOVEMENT_TYPES.OUT, currentMonth),
      monthlyPurchaseValue: monthValue(MOVEMENT_TYPES.IN, currentMonth, { fromPo: true }),
      monthlyWastageValue: monthValue(MOVEMENT_TYPES.WASTAGE, currentMonth),
      monthStart,
    },
    charts: {
      monthlyConsumption: months.map((m) => ({ month: m, value: monthValue(MOVEMENT_TYPES.OUT, m) })),
      monthlyPurchases: months.map((m) => ({ month: m, value: monthValue(MOVEMENT_TYPES.IN, m, { fromPo: true }) })),
      wastageTrend: months.map((m) => ({ month: m, value: monthValue(MOVEMENT_TYPES.WASTAGE, m) })),
      categoryBreakdown: [...catMap.values()].map((c) => ({ ...c, value: roundMoney(c.value) })).sort((a, b) => b.value - a.value),
      stockStatus: [
        { status: STOCK_STATUS.IN_STOCK, label: 'In stock', count: count((i) => i.stockStatus === STOCK_STATUS.IN_STOCK) },
        { status: STOCK_STATUS.LOW_STOCK, label: 'Low stock', count: count((i) => i.stockStatus === STOCK_STATUS.LOW_STOCK) },
        { status: STOCK_STATUS.OUT_OF_STOCK, label: 'Out of stock', count: count((i) => i.stockStatus === STOCK_STATUS.OUT_OF_STOCK) },
        { status: STOCK_STATUS.OVERSTOCKED, label: 'Overstocked', count: count((i) => i.stockStatus === STOCK_STATUS.OVERSTOCKED) },
      ],
      // Items closest to (or below) their reorder point: current stock vs reorder point vs max.
      stockLevels: items
        .filter((i) => i.reorderPoint > 0)
        .sort((a, b) => a.currentStock / a.reorderPoint - b.currentStock / b.reorderPoint)
        .slice(0, 10)
        .map((i) => ({ name: i.name, unit: i.unit, currentStock: i.currentStock, reorderPoint: i.reorderPoint, maxStock: i.maxStock })),
      topConsumed: topConsumed.map((t) => ({ ...t, quantity: Math.round(t.quantity * 100) / 100, value: roundMoney(t.value) })),
    },
    lowStockAlerts: lowStockItems.slice(0, 6).map((i) => ({
      _id: i._id, name: i.name, sku: i.sku, unit: i.unit, currentStock: i.currentStock, reorderPoint: i.reorderPoint, stockStatus: i.stockStatus, supplier: i.supplier?.name,
    })),
    recentMovements,
    recentOrders,
  };
}
