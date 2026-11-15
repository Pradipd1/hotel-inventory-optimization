import { addDays, format, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { ConsumptionRecord, Hotel, InventoryItem, PurchaseOrder, StockMovement } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { MOVEMENT_TYPES, PO_STATUS } from '../utils/constants.js';
import { roundMoney, toObjectId } from '../utils/helpers.js';
import { decorateItem, statusFilter } from './inventoryStatus.js';
import { TIMEZONE } from './dashboardService.js';
import { getRecommendations } from './optimization/optimizationService.js';

const MAX_ROWS = 5000;
const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

function dateRange(filters, defaultMonths = 3) {
  const to = filters.to ? new Date(`${filters.to.slice(0, 10)}T23:59:59.999`) : new Date();
  const from = filters.from ? startOfDay(new Date(filters.from)) : startOfMonth(subMonths(to, defaultMonths - 1));
  if (from > to) throw ApiError.badRequest('"From" date must be before "To" date');
  return { from, to };
}

async function itemFilter(hotelId, filters) {
  const f = { hotelId, isArchived: false };
  if (filters.category) f.category = toObjectId(filters.category);
  if (filters.item) f._id = toObjectId(filters.item);
  if (filters.supplier) f.supplier = toObjectId(filters.supplier);
  return f;
}

/** Restricts movement/consumption queries to items matching category/item filters. */
async function itemIdsFor(hotelId, filters) {
  if (!filters.category && !filters.item) return null;
  const f = { hotelId };
  if (filters.category) f.category = toObjectId(filters.category);
  if (filters.item) f._id = toObjectId(filters.item);
  return InventoryItem.find(f).distinct('_id');
}

const REPORTS = {
  inventory: {
    title: 'Current Inventory Report',
    description: 'All active items with current stock, value and status.',
    filters: ['category', 'item', 'supplier', 'status'],
    async run(hotelId, filters, settings) {
      const items = await InventoryItem.find({ ...(await itemFilter(hotelId, filters)), ...statusFilter(filters.status, settings) })
        .populate('category', 'name').populate('supplier', 'name').sort({ name: 1 }).lean();
      const rows = items.map((i) => decorateItem(i, settings)).map((i) => ({
        sku: i.sku, name: i.name, category: i.category?.name, unit: i.unit, currentStock: i.currentStock,
        reorderPoint: i.reorderPoint, maxStock: i.maxStock || '', unitCost: i.unitCost, stockValue: i.stockValue,
        status: label(i.stockStatus), location: i.location, supplier: i.supplier?.name ?? '',
      }));
      return {
        columns: [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
          { key: 'unit', label: 'Unit' }, { key: 'currentStock', label: 'Stock', type: 'number' },
          { key: 'reorderPoint', label: 'Reorder pt', type: 'number' }, { key: 'maxStock', label: 'Max', type: 'number' },
          { key: 'unitCost', label: 'Unit cost', type: 'currency' }, { key: 'stockValue', label: 'Value', type: 'currency' },
          { key: 'status', label: 'Status', type: 'status' }, { key: 'location', label: 'Location' }, { key: 'supplier', label: 'Supplier' },
        ],
        rows,
        summary: [
          { label: 'Items', value: rows.length },
          { label: 'Total stock value', value: roundMoney(rows.reduce((s, r) => s + r.stockValue, 0)), type: 'currency' },
        ],
      };
    },
  },

  'low-stock': {
    title: 'Low Stock Report',
    description: 'Items at or below their reorder point, including out-of-stock items.',
    filters: ['category', 'supplier'],
    async run(hotelId, filters, settings) {
      const items = await InventoryItem.find({ ...(await itemFilter(hotelId, filters)), $expr: { $lte: ['$currentStock', '$reorderPoint'] } })
        .populate('category', 'name').populate('supplier', 'name').lean();
      const rows = items
        .map((i) => decorateItem(i, settings))
        .sort((a, b) => a.currentStock / (a.reorderPoint || 1) - b.currentStock / (b.reorderPoint || 1))
        .map((i) => ({
          sku: i.sku, name: i.name, category: i.category?.name, currentStock: i.currentStock, unit: i.unit,
          reorderPoint: i.reorderPoint, shortfall: Math.max(0, i.reorderPoint - i.currentStock),
          status: label(i.stockStatus), supplier: i.supplier?.name ?? 'Not assigned',
        }));
      return {
        columns: [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
          { key: 'currentStock', label: 'Stock', type: 'number' }, { key: 'unit', label: 'Unit' },
          { key: 'reorderPoint', label: 'Reorder point', type: 'number' }, { key: 'shortfall', label: 'Below ROP by', type: 'number' },
          { key: 'status', label: 'Status', type: 'status' }, { key: 'supplier', label: 'Supplier' },
        ],
        rows,
        summary: [
          { label: 'Low stock', value: rows.filter((r) => r.status === 'Low Stock').length },
          { label: 'Out of stock', value: rows.filter((r) => r.status === 'Out Of Stock').length },
        ],
      };
    },
  },

  movements: {
    title: 'Stock Movement Report',
    description: 'Every stock transaction in the period with before/after balances.',
    filters: ['dateRange', 'category', 'item', 'movementType'],
    async run(hotelId, filters) {
      const { from, to } = dateRange(filters, 1);
      const match = { hotelId, occurredAt: { $gte: from, $lte: to } };
      if (filters.movementType) match.type = filters.movementType;
      const ids = await itemIdsFor(hotelId, filters);
      if (ids) match.item = { $in: ids };
      const moves = await StockMovement.find(match).sort({ occurredAt: -1 }).limit(MAX_ROWS).lean();
      const byType = {};
      for (const m of moves) byType[m.type] = (byType[m.type] || 0) + 1;
      return {
        columns: [
          { key: 'occurredAt', label: 'Date', type: 'datetime' }, { key: 'referenceNo', label: 'Reference' },
          { key: 'itemName', label: 'Item' }, { key: 'type', label: 'Type', type: 'status' },
          { key: 'change', label: 'Change', type: 'number' }, { key: 'unit', label: 'Unit' },
          { key: 'balanceAfter', label: 'Balance', type: 'number' }, { key: 'totalValue', label: 'Value', type: 'currency' },
          { key: 'performedByName', label: 'By' }, { key: 'reason', label: 'Reason' },
        ],
        rows: moves.map((m) => ({ ...m, type: label(m.type), change: m.type === MOVEMENT_TYPES.TRANSFER ? `→ ${m.toLocation}` : m.change, reason: m.reason ?? '' })),
        summary: [
          { label: 'Movements', value: moves.length },
          ...Object.entries(byType).map(([t, c]) => ({ label: label(t), value: c })),
        ],
        truncated: moves.length === MAX_ROWS,
      };
    },
  },

  consumption: {
    title: 'Monthly Consumption Report',
    description: 'Quantity and value consumed per item per month (Stock Out only).',
    filters: ['dateRange', 'category', 'item'],
    async run(hotelId, filters) {
      const { from, to } = dateRange(filters, 6);
      const match = { hotelId, date: { $gte: from, $lte: to } };
      const ids = await itemIdsFor(hotelId, filters);
      if (ids) match.item = { $in: ids };
      const rows = await ConsumptionRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: { month: { $dateToString: { format: '%Y-%m', date: '$date', timezone: TIMEZONE } }, item: '$item' },
            quantity: { $sum: '$quantity' },
            value: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
            days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: TIMEZONE } } },
          },
        },
        { $lookup: { from: 'inventoryitems', localField: '_id.item', foreignField: '_id', as: 'item' } },
        { $unwind: '$item' },
        { $lookup: { from: 'categories', localField: 'item.category', foreignField: '_id', as: 'category' } },
        { $sort: { '_id.month': 1, 'item.name': 1 } },
      ]);
      const data = rows.map((r) => ({
        month: r._id.month, name: r.item.name, category: r.category[0]?.name ?? '', unit: r.item.unit,
        quantity: Math.round(r.quantity * 100) / 100, value: roundMoney(r.value), activeDays: r.days.length,
      }));
      const monthly = new Map();
      for (const d of data) monthly.set(d.month, roundMoney((monthly.get(d.month) || 0) + d.value));
      return {
        columns: [
          { key: 'month', label: 'Month' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
          { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'unit', label: 'Unit' },
          { key: 'value', label: 'Value', type: 'currency' }, { key: 'activeDays', label: 'Days used', type: 'number' },
        ],
        rows: data,
        summary: [{ label: 'Total consumption value', value: roundMoney(data.reduce((s, d) => s + d.value, 0)), type: 'currency' }],
        chart: { type: 'bar', xKey: 'month', series: [{ key: 'value', label: 'Consumption value' }], data: [...monthly].map(([month, value]) => ({ month, value })) },
      };
    },
  },

  'supplier-purchases': {
    title: 'Supplier Purchase Report',
    description: 'Purchase order volume and value per supplier (cancelled orders excluded).',
    filters: ['dateRange', 'supplier'],
    async run(hotelId, filters) {
      const { from, to } = dateRange(filters, 6);
      const match = { hotelId, createdAt: { $gte: from, $lte: to }, status: { $ne: PO_STATUS.CANCELLED } };
      if (filters.supplier) match.supplier = toObjectId(filters.supplier);
      const rows = await PurchaseOrder.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$supplier',
            orders: { $addToSet: '$_id' },
            orderedValue: { $sum: '$items.lineTotal' },
            receivedValue: { $sum: { $multiply: ['$items.receivedQuantity', '$items.unitPrice'] } },
            lines: { $sum: 1 },
          },
        },
        { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
        { $unwind: '$supplier' },
        { $sort: { orderedValue: -1 } },
      ]);
      const data = rows.map((r) => ({
        supplier: r.supplier.name, company: r.supplier.companyName ?? '', orders: r.orders.length, lines: r.lines,
        orderedValue: roundMoney(r.orderedValue), receivedValue: roundMoney(r.receivedValue), paymentTerms: r.supplier.paymentTerms ?? '',
      }));
      return {
        columns: [
          { key: 'supplier', label: 'Supplier' }, { key: 'company', label: 'Company' }, { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'lines', label: 'Lines', type: 'number' }, { key: 'orderedValue', label: 'Ordered (excl. tax)', type: 'currency' },
          { key: 'receivedValue', label: 'Received value', type: 'currency' }, { key: 'paymentTerms', label: 'Payment terms' },
        ],
        rows: data,
        summary: [
          { label: 'Suppliers', value: data.length },
          { label: 'Total ordered', value: roundMoney(data.reduce((s, d) => s + d.orderedValue, 0)), type: 'currency' },
          { label: 'Total received', value: roundMoney(data.reduce((s, d) => s + d.receivedValue, 0)), type: 'currency' },
        ],
        chart: { type: 'bar', xKey: 'supplier', series: [{ key: 'orderedValue', label: 'Ordered' }, { key: 'receivedValue', label: 'Received' }], data },
      };
    },
  },

  'purchase-orders': {
    title: 'Purchase Order Report',
    description: 'Purchase orders created in the period with status and totals.',
    filters: ['dateRange', 'supplier', 'poStatus'],
    async run(hotelId, filters) {
      const { from, to } = dateRange(filters, 3);
      const match = { hotelId, createdAt: { $gte: from, $lte: to } };
      if (filters.supplier) match.supplier = toObjectId(filters.supplier);
      if (filters.poStatus) match.status = filters.poStatus;
      const orders = await PurchaseOrder.find(match).sort({ createdAt: -1 }).limit(MAX_ROWS)
        .populate('supplier', 'name').populate('createdBy', 'name').populate('approvedBy', 'name').lean();
      const byStatus = {};
      for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      return {
        columns: [
          { key: 'poNumber', label: 'PO number' }, { key: 'createdAt', label: 'Created', type: 'date' },
          { key: 'supplier', label: 'Supplier' }, { key: 'lines', label: 'Lines', type: 'number' },
          { key: 'total', label: 'Total', type: 'currency' }, { key: 'status', label: 'Status', type: 'status' },
          { key: 'createdBy', label: 'Created by' }, { key: 'approvedBy', label: 'Approved by' },
        ],
        rows: orders.map((o) => ({
          poNumber: o.poNumber, createdAt: o.createdAt, supplier: o.supplier?.name, lines: o.items.length, total: o.total,
          status: label(o.status), createdBy: o.createdBy?.name ?? '', approvedBy: o.approvedBy?.name ?? '',
        })),
        summary: [
          { label: 'Orders', value: orders.length },
          { label: 'Total value', value: roundMoney(orders.filter((o) => o.status !== PO_STATUS.CANCELLED).reduce((s, o) => s + o.total, 0)), type: 'currency' },
          ...Object.entries(byStatus).map(([s, c]) => ({ label: label(s), value: c })),
        ],
        chart: { type: 'pie', xKey: 'status', series: [{ key: 'count', label: 'Orders' }], data: Object.entries(byStatus).map(([s, c]) => ({ status: label(s), count: c })) },
      };
    },
  },

  expiry: {
    title: 'Expiry Report',
    description: 'Items in stock that have expired or expire within the selected number of days.',
    filters: ['category', 'withinDays'],
    async run(hotelId, filters, settings) {
      const within = Number(filters.withinDays) || settings.expiryWarningDays || 30;
      const items = await InventoryItem.find({
        ...(await itemFilter(hotelId, filters)),
        currentStock: { $gt: 0 },
        expiryDate: { $ne: null, $lt: addDays(startOfDay(new Date()), within + 1) },
      }).populate('category', 'name').sort({ expiryDate: 1 }).lean();
      const rows = items.map((i) => decorateItem(i, settings)).map((i) => ({
        sku: i.sku, name: i.name, category: i.category?.name, expiryDate: i.expiryDate, daysToExpiry: i.daysToExpiry,
        status: label(i.expiryStatus), currentStock: i.currentStock, unit: i.unit, valueAtRisk: i.stockValue, location: i.location,
      }));
      return {
        columns: [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
          { key: 'expiryDate', label: 'Expiry date', type: 'date' }, { key: 'daysToExpiry', label: 'Days left', type: 'number' },
          { key: 'status', label: 'Status', type: 'status' }, { key: 'currentStock', label: 'Stock', type: 'number' },
          { key: 'unit', label: 'Unit' }, { key: 'valueAtRisk', label: 'Stock value', type: 'currency' }, { key: 'location', label: 'Location' },
        ],
        rows,
        summary: [
          { label: 'Expired', value: rows.filter((r) => r.daysToExpiry < 0).length },
          { label: `Expiring within ${within} days`, value: rows.filter((r) => r.daysToExpiry >= 0).length },
          { label: 'Value affected', value: roundMoney(rows.reduce((s, r) => s + r.valueAtRisk, 0)), type: 'currency' },
        ],
      };
    },
  },

  wastage: {
    title: 'Wastage Report',
    description: 'Stock written off as wastage (expired, damaged or spoiled) in the period.',
    filters: ['dateRange', 'category', 'item'],
    async run(hotelId, filters) {
      const { from, to } = dateRange(filters, 6);
      const match = { hotelId, type: MOVEMENT_TYPES.WASTAGE, occurredAt: { $gte: from, $lte: to } };
      const ids = await itemIdsFor(hotelId, filters);
      if (ids) match.item = { $in: ids };
      const moves = await StockMovement.find(match).sort({ occurredAt: -1 }).limit(MAX_ROWS).lean();
      const monthly = new Map();
      for (const m of moves) {
        const k = format(m.occurredAt, 'yyyy-MM');
        monthly.set(k, roundMoney((monthly.get(k) || 0) + m.totalValue));
      }
      return {
        columns: [
          { key: 'occurredAt', label: 'Date', type: 'date' }, { key: 'referenceNo', label: 'Reference' },
          { key: 'itemName', label: 'Item' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'unit', label: 'Unit' },
          { key: 'totalValue', label: 'Value lost', type: 'currency' }, { key: 'reason', label: 'Reason' }, { key: 'performedByName', label: 'Recorded by' },
        ],
        rows: moves,
        summary: [
          { label: 'Wastage entries', value: moves.length },
          { label: 'Total value lost', value: roundMoney(moves.reduce((s, m) => s + m.totalValue, 0)), type: 'currency' },
        ],
        chart: { type: 'bar', xKey: 'month', series: [{ key: 'value', label: 'Wastage value' }], data: [...monthly].sort().map(([month, value]) => ({ month, value })) },
      };
    },
  },

  valuation: {
    title: 'Inventory Valuation Report',
    description: 'Stock value (quantity × unit cost) grouped by category.',
    filters: ['category'],
    async run(hotelId, filters) {
      const rows = await InventoryItem.aggregate([
        { $match: await itemFilter(hotelId, filters) },
        { $group: { _id: '$category', items: { $sum: 1 }, value: { $sum: { $multiply: ['$currentStock', '$unitCost'] } }, outOfStock: { $sum: { $cond: [{ $lte: ['$currentStock', 0] }, 1, 0] } } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
        { $sort: { value: -1 } },
      ]);
      const total = rows.reduce((s, r) => s + r.value, 0);
      const data = rows.map((r) => ({
        category: r.category[0]?.name ?? 'Uncategorised', items: r.items, outOfStock: r.outOfStock,
        value: roundMoney(r.value), share: total ? `${((r.value / total) * 100).toFixed(1)}%` : '0%',
      }));
      return {
        columns: [
          { key: 'category', label: 'Category' }, { key: 'items', label: 'Items', type: 'number' },
          { key: 'outOfStock', label: 'Out of stock', type: 'number' }, { key: 'value', label: 'Stock value', type: 'currency' }, { key: 'share', label: 'Share' },
        ],
        rows: data,
        summary: [{ label: 'Total inventory value', value: roundMoney(total), type: 'currency' }],
        chart: { type: 'pie', xKey: 'category', series: [{ key: 'value', label: 'Value' }], data },
      };
    },
  },

  optimization: {
    title: 'Optimization Recommendation Report',
    description: 'Reorder, overstock and expiry recommendations from the optimization engine.',
    filters: ['category'],
    async run(hotelId, filters, settings) {
      const result = await getRecommendations(hotelId);
      const inCategory = (r) => !filters.category || String(r.item.category?._id) === filters.category;
      const rows = [
        ...result.reorder.filter(inCategory).map((r) => ({
          type: 'Reorder', priority: label(r.priority), name: r.item.name, currentStock: r.currentStock, unit: r.item.unit,
          avgDailyDemand: r.avgDailyDemand, reorderPoint: r.reorderPoint, suggestedQuantity: r.suggestedQuantity,
          estimatedCost: r.estimatedCost, supplier: r.supplier?.name ?? 'Not assigned', reason: r.reason,
        })),
        ...result.overstock.filter(inCategory).map((r) => ({
          type: 'Overstock', priority: label(r.priority), name: r.item.name, currentStock: r.currentStock, unit: r.item.unit,
          avgDailyDemand: r.avgDailyDemand, reorderPoint: '', suggestedQuantity: 0, estimatedCost: 0, supplier: r.item.supplier?.name ?? '', reason: r.reason,
        })),
        ...result.expiry.filter(inCategory).map((r) => ({
          type: 'Expiry risk', priority: label(r.priority), name: r.item.name, currentStock: r.currentStock, unit: r.item.unit,
          avgDailyDemand: r.avgDailyDemand, reorderPoint: '', suggestedQuantity: 0, estimatedCost: 0, supplier: r.item.supplier?.name ?? '', reason: r.reason,
        })),
      ];
      return {
        columns: [
          { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority', type: 'status' }, { key: 'name', label: 'Item' },
          { key: 'currentStock', label: 'Stock', type: 'number' }, { key: 'unit', label: 'Unit' },
          { key: 'avgDailyDemand', label: 'Avg/day', type: 'number' }, { key: 'reorderPoint', label: 'Reorder pt', type: 'number' },
          { key: 'suggestedQuantity', label: 'Suggested qty', type: 'number' }, { key: 'estimatedCost', label: 'Est. cost', type: 'currency' },
          { key: 'supplier', label: 'Supplier' }, { key: 'reason', label: 'Reason', wide: true },
        ],
        rows,
        summary: [
          { label: 'Reorder recommendations', value: result.summary.reorderCount },
          { label: 'Estimated reorder cost', value: result.summary.estimatedReorderCost, type: 'currency' },
          { label: 'Overstocked items', value: result.summary.overstockCount },
          { label: 'Expiry risks', value: result.summary.expiryRiskCount },
        ],
        note: `Forecast method: ${result.parameters.method}; ${settings.forecastWindowDays ?? 30}-day window.`,
      };
    },
  },
};

export const REPORT_LIST = Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, description: r.description, filters: r.filters }));

export async function runReport(hotelId, key, filters = {}) {
  const def = REPORTS[key];
  if (!def) throw ApiError.notFound('Unknown report');
  const hotel = await Hotel.findById(hotelId).lean();
  const settings = hotel?.settings || {};
  const result = await def.run(hotelId, filters, settings);
  return {
    key,
    title: def.title,
    description: def.description,
    hotel: hotel?.name,
    currency: settings.currency || 'NPR',
    generatedAt: new Date(),
    filters,
    ...result,
  };
}
