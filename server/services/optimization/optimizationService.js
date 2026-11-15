import { addDays, format, max as maxDate, startOfDay, subDays } from 'date-fns';
import { ConsumptionRecord, Hotel, InventoryItem, PurchaseOrder } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { PO_STATUS } from '../../utils/constants.js';
import { computeExpiryStatus, computeStockStatus } from '../inventoryStatus.js';
import {
  buildDailySeries,
  calculateReorderPoint,
  daysOfCover,
  economicOrderQuantity,
  expiryWastageRisk,
  forecastDemand,
  mean,
  movingAverageSeries,
  reorderPriority,
  round,
  statisticalSafetyStock,
  stdDev,
  suggestOrderQuantity,
} from './algorithms.js';

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Loads consumption for the analysis window and the first-ever consumption date per item. */
async function loadConsumption(hotelId, itemIds, windowStart) {
  const [records, firstDates] = await Promise.all([
    ConsumptionRecord.find({ hotelId, item: { $in: itemIds }, date: { $gte: windowStart } })
      .select('item date quantity')
      .lean(),
    ConsumptionRecord.aggregate([
      { $match: { hotelId, item: { $in: itemIds } } },
      { $group: { _id: '$item', first: { $min: '$date' } } },
    ]),
  ]);
  const byItem = new Map();
  for (const r of records) {
    const k = String(r.item);
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(r);
  }
  return { byItem, firstDates: new Map(firstDates.map((f) => [String(f._id), f.first])) };
}

const NO_ORDERS = Object.freeze({ onOrder: 0, onOrderPOs: [], pendingQuantity: 0, pendingPOs: [] });

/**
 * Outstanding purchase-order quantities per item.
 * onOrder: approved / ordered / partially received (remaining quantity), so it will arrive.
 * pending: draft or awaiting approval; shown as a warning against double-ordering but not counted.
 */
async function loadOpenOrders(hotelId, itemIds) {
  const pos = await PurchaseOrder.find({
    hotelId,
    status: { $in: [PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED, PO_STATUS.ORDERED, PO_STATUS.PARTIALLY_RECEIVED] },
    'items.item': { $in: itemIds },
  })
    .select('poNumber status items.item items.quantity items.receivedQuantity')
    .lean();
  const map = new Map();
  for (const po of pos) {
    const counted = [PO_STATUS.APPROVED, PO_STATUS.ORDERED, PO_STATUS.PARTIALLY_RECEIVED].includes(po.status);
    for (const line of po.items) {
      const k = String(line.item);
      const entry = map.get(k) || { onOrder: 0, onOrderPOs: [], pendingQuantity: 0, pendingPOs: [] };
      const remaining = Math.max(0, line.quantity - line.receivedQuantity);
      if (counted) {
        entry.onOrder = round(entry.onOrder + remaining, 3);
        entry.onOrderPOs.push(po.poNumber);
      } else {
        entry.pendingQuantity = round(entry.pendingQuantity + remaining, 3);
        entry.pendingPOs.push(po.poNumber);
      }
      map.set(k, entry);
    }
  }
  return map;
}

/**
 * Full analysis for one item. `series` is built from the item's first consumption date (or
 * creation date) so days before the item existed are not counted as zero demand.
 * Reorder decisions use the inventory position (on hand + on order), the standard
 * reorder-point rule, so stock that is already on its way is not ordered twice.
 */
export function analyzeItem(item, records, firstConsumption, settings, now = new Date(), orders = NO_ORDERS) {
  const windowDays = settings.forecastWindowDays ?? 30;
  const horizonDays = settings.forecastHorizonDays ?? 30;
  const today = startOfDay(now);
  const windowStart = subDays(today, windowDays); // last N complete days (today is partial)
  const historyStart = maxDate([windowStart, startOfDay(firstConsumption || item.createdAt || today)]);
  // Today is partial, so the series ends yesterday unless the item's history starts today.
  const seriesEnd = historyStart < today ? subDays(today, 1) : today;
  const series = buildDailySeries(records, historyStart, seriesEnd);
  const values = series.map((d) => d.quantity);
  const forecast = forecastDemand(values, { window: windowDays, horizonDays });
  const insufficient = forecast.dataQuality.level === 'insufficient';
  // Calculations use the unrounded window statistics; the forecast object holds rounded display values.
  const recent = values.slice(-forecast.windowDays);
  const avgDaily = forecast.windowDays ? mean(recent) : 0;
  const sdDaily = stdDev(recent);

  // Parameters and where each value came from.
  const leadTimeDays = item.leadTimeDays ?? item.supplier?.leadTimeDays ?? null;
  const leadTimeSource = item.leadTimeDays != null ? 'item' : item.supplier?.leadTimeDays != null ? 'supplier' : null;
  const safetyStock = item.safetyStock ?? 0;
  const orderingCost = item.orderingCost ?? settings.defaultOrderingCost ?? null;
  const orderingCostSource = item.orderingCost != null ? 'item' : settings.defaultOrderingCost != null ? 'hotel default' : null;
  let holdingCost = item.holdingCostPerUnit ?? null;
  let holdingCostSource = holdingCost != null ? 'item' : null;
  if (holdingCost == null && settings.holdingCostRate != null && item.unitCost > 0) {
    holdingCost = round((item.unitCost * settings.holdingCostRate) / 100, 4);
    holdingCostSource = `${settings.holdingCostRate}% of unit cost`;
  }
  const annualDemandRaw = avgDaily * 365;
  const annualDemand = round(annualDemandRaw, 2);

  const eoq = insufficient
    ? { canCalculate: false, value: null, missing: ['at least 7 days of consumption history'] }
    : economicOrderQuantity({ annualDemand: annualDemandRaw, orderingCost, holdingCost });
  const calculatedRop = insufficient
    ? { canCalculate: false, value: null, missing: ['at least 7 days of consumption history'] }
    : calculateReorderPoint({ avgDailyDemand: avgDaily, leadTimeDays, safetyStock });

  const effectiveReorderPoint = calculatedRop.canCalculate ? calculatedRop.value : item.reorderPoint;
  const reorderPointSource = calculatedRop.canCalculate ? 'calculated' : 'configured';
  const cover = daysOfCover(item.currentStock, avgDaily);
  const stockStatus = computeStockStatus(item);
  const expiry = computeExpiryStatus(item, settings, now);
  const inventoryPosition = round(item.currentStock + orders.onOrder, 3);

  const order = suggestOrderQuantity({
    currentStock: inventoryPosition,
    reorderPoint: effectiveReorderPoint,
    eoq: eoq.value,
    maxStock: item.maxStock,
    avgDailyDemand: avgDaily,
    horizonDays,
  });

  return {
    item: {
      _id: item._id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      category: item.category,
      supplier: item.supplier ? { _id: item.supplier._id, name: item.supplier.name, status: item.supplier.status } : null,
      currentStock: item.currentStock,
      minStock: item.minStock,
      maxStock: item.maxStock,
      configuredReorderPoint: item.reorderPoint,
      unitCost: item.unitCost,
      expiryDate: item.expiryDate,
      stockStatus,
    },
    parameters: {
      leadTimeDays,
      leadTimeSource,
      safetyStock,
      safetyStockConfigured: item.safetyStock != null,
      orderingCost,
      orderingCostSource,
      holdingCost,
      holdingCostSource,
      annualDemand,
    },
    forecast,
    series,
    eoq,
    calculatedReorderPoint: calculatedRop,
    effectiveReorderPoint: round(effectiveReorderPoint, 2),
    reorderPointSource,
    suggestedSafetyStock: statisticalSafetyStock({ stdDevDaily: sdDaily, leadTimeDays }),
    daysOfCover: cover,
    orders,
    inventoryPosition,
    suggestedOrder: order,
    expiry: { ...expiry, ...(expiryWastageRisk({ currentStock: item.currentStock, avgDailyDemand: avgDaily, daysToExpiry: expiry.daysToExpiry, unitCost: item.unitCost }) || {}) },
  };
}

function reorderRecommendation(a) {
  const { item, parameters: p, orders } = a;
  const position = a.inventoryPosition;
  const positionCover = daysOfCover(position, a.forecast.avgDailyDemand);
  const priority =
    item.currentStock <= 0 && orders.onOrder <= 0
      ? 'critical'
      : reorderPriority({ currentStock: position, reorderPoint: a.effectiveReorderPoint, cover: positionCover, leadTimeDays: p.leadTimeDays });
  if (!priority || a.suggestedOrder.quantity <= 0) return null;

  const u = item.unit;
  const parts = [];
  if (orders.onOrder > 0) {
    parts.push(`${fmt(orders.onOrder)} ${u} is already on order (${orders.onOrderPOs.join(', ')}), giving an inventory position of ${fmt(position)} ${u}.`);
  }
  if (item.currentStock <= 0) parts.push(`${item.name} is out of stock.`);
  else if (item.currentStock <= a.effectiveReorderPoint) {
    parts.push(`${item.name} stock (${fmt(item.currentStock)} ${u}) is at or below its ${a.reorderPointSource} reorder point of ${fmt(a.effectiveReorderPoint)} ${u}.`);
  } else {
    parts.push(`${item.name} stock (${fmt(item.currentStock)} ${u}) is within 20% of its reorder point (${fmt(a.effectiveReorderPoint)} ${u}).`);
  }
  if (a.forecast.avgDailyDemand > 0) {
    parts.push(`Average consumption is ${fmt(a.forecast.avgDailyDemand)} ${u}/day over the last ${a.forecast.windowDays} days`);
    if (a.daysOfCover != null && item.currentStock > 0) parts[parts.length - 1] += `, so current stock lasts about ${fmt(a.daysOfCover)} day(s)`;
    if (p.leadTimeDays != null) parts[parts.length - 1] += ` against a ${p.leadTimeDays}-day supplier lead time`;
    parts[parts.length - 1] += '.';
  } else {
    parts.push('No recent consumption history, so the order quantity is based on configured stock levels.');
  }
  parts.push(`Consider ordering ${fmt(a.suggestedOrder.quantity)} ${u} (${a.suggestedOrder.basis}).`);
  if (orders.pendingQuantity > 0) {
    parts.push(`Note: ${fmt(orders.pendingQuantity)} ${u} is in draft/pending order ${orders.pendingPOs.join(', ')}; approve that instead of creating a duplicate.`);
  }
  if (!item.supplier) parts.push('No supplier is assigned to this item yet.');

  return {
    type: 'reorder',
    priority,
    item: item,
    currentStock: item.currentStock,
    onOrder: orders.onOrder,
    pendingOrderQuantity: orders.pendingQuantity,
    pendingPOs: orders.pendingPOs,
    inventoryPosition: position,
    avgDailyDemand: a.forecast.avgDailyDemand,
    reorderPoint: a.effectiveReorderPoint,
    reorderPointSource: a.reorderPointSource,
    configuredReorderPoint: item.configuredReorderPoint,
    eoq: a.eoq.value,
    eoqMissing: a.eoq.missing,
    suggestedQuantity: a.suggestedOrder.quantity,
    basis: a.suggestedOrder.basis,
    estimatedCost: round(a.suggestedOrder.quantity * item.unitCost, 2),
    supplier: item.supplier,
    leadTimeDays: p.leadTimeDays,
    daysOfCover: a.daysOfCover,
    dataQuality: a.forecast.dataQuality,
    reason: parts.join(' '),
  };
}

function overstockRecommendation(a) {
  const { item } = a;
  if (!(item.maxStock > 0 && item.currentStock > item.maxStock)) return null;
  const excess = round(item.currentStock - item.maxStock, 2);
  const u = item.unit;
  let reason = `${item.name} has ${fmt(item.currentStock)} ${u}, which is ${fmt(excess)} ${u} above the maximum stock level of ${fmt(item.maxStock)} ${u}.`;
  if (a.daysOfCover != null) reason += ` At ${fmt(a.forecast.avgDailyDemand)} ${u}/day this is about ${fmt(a.daysOfCover)} days of stock.`;
  reason += ' Pause or reduce purchases of this item until stock returns below the maximum.';
  return {
    type: 'overstock',
    priority: 'low',
    item,
    currentStock: item.currentStock,
    maxStock: item.maxStock,
    excessQuantity: excess,
    excessValue: round(excess * item.unitCost, 2),
    avgDailyDemand: a.forecast.avgDailyDemand,
    daysOfCover: a.daysOfCover,
    reason,
  };
}

function expiryRecommendation(a) {
  const { item, expiry } = a;
  if (!expiry.status || expiry.status === 'ok' || item.currentStock <= 0) return null;
  const u = item.unit;
  let priority;
  let reason;
  if (expiry.status === 'expired') {
    priority = 'critical';
    reason = `${fmt(item.currentStock)} ${u} of ${item.name} expired ${Math.abs(expiry.daysToExpiry)} day(s) ago. Remove it from use and record it as wastage.`;
  } else {
    priority = expiry.status === 'expiring_critical' ? 'high' : 'medium';
    reason = `${item.name} expires in ${expiry.daysToExpiry} day(s).`;
    if (expiry.atRiskQuantity > 0) {
      reason += ` At ${fmt(a.forecast.avgDailyDemand)} ${u}/day only ${fmt(expiry.projectedConsumptionBeforeExpiry)} ${u} will be used in time, leaving ${fmt(expiry.atRiskQuantity)} ${u} at risk of wastage. Use it first (FEFO), move it to a higher-use outlet, or avoid reordering until it is used.`;
    } else {
      reason += ' Current consumption should use all stock before expiry. Keep issuing this batch first.';
    }
  }
  return {
    type: 'expiry',
    priority,
    item,
    currentStock: item.currentStock,
    expiryDate: item.expiryDate,
    daysToExpiry: expiry.daysToExpiry,
    expiryStatus: expiry.status,
    avgDailyDemand: a.forecast.avgDailyDemand,
    atRiskQuantity: expiry.atRiskQuantity,
    atRiskValue: expiry.atRiskValue,
    reason,
  };
}

const sortByPriority = (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.estimatedCost ?? b.atRiskValue ?? 0) - (a.estimatedCost ?? a.atRiskValue ?? 0);

/** Runs the engine for every active item of a hotel. */
export async function getRecommendations(hotelId, { now = new Date() } = {}) {
  const hotel = await Hotel.findById(hotelId).lean();
  const settings = hotel?.settings || {};
  const items = await InventoryItem.find({ hotelId, isArchived: false })
    .populate('supplier', 'name leadTimeDays status')
    .populate('category', 'name color')
    .lean();
  const windowStart = subDays(startOfDay(now), settings.forecastWindowDays ?? 30);
  const itemIds = items.map((i) => i._id);
  const [{ byItem, firstDates }, openOrders] = await Promise.all([
    loadConsumption(hotelId, itemIds, windowStart),
    loadOpenOrders(hotelId, itemIds),
  ]);

  const analyses = items.map((item) => {
    const k = String(item._id);
    return analyzeItem(item, byItem.get(k) || [], firstDates.get(k), settings, now, openOrders.get(k) || NO_ORDERS);
  });

  const reorder = analyses.map(reorderRecommendation).filter(Boolean).sort(sortByPriority);
  const overstock = analyses.map(overstockRecommendation).filter(Boolean).sort((a, b) => b.excessValue - a.excessValue);
  const expiry = analyses.map(expiryRecommendation).filter(Boolean).sort(sortByPriority);

  const analysis = analyses.map((a) => ({
    item: a.item,
    avgDailyDemand: a.forecast.avgDailyDemand,
    predictedDemand: a.forecast.predictedDemand,
    trend: a.forecast.trend,
    dataQuality: a.forecast.dataQuality,
    daysOfCover: a.daysOfCover,
    onOrder: a.orders.onOrder,
    leadTimeDays: a.parameters.leadTimeDays,
    configuredReorderPoint: a.item.configuredReorderPoint,
    calculatedReorderPoint: a.calculatedReorderPoint.value,
    reorderPointMissing: a.calculatedReorderPoint.missing,
    eoq: a.eoq.value,
    eoqMissing: a.eoq.missing,
  }));

  return {
    generatedAt: now,
    parameters: {
      forecastWindowDays: settings.forecastWindowDays ?? 30,
      forecastHorizonDays: settings.forecastHorizonDays ?? 30,
      defaultOrderingCost: settings.defaultOrderingCost ?? null,
      holdingCostRate: settings.holdingCostRate ?? null,
      currency: settings.currency ?? 'NPR',
      method: 'Simple moving average (statistical, not machine learning)',
    },
    summary: {
      itemsAnalyzed: analyses.length,
      reorderCount: reorder.length,
      criticalCount: reorder.filter((r) => r.priority === 'critical').length,
      estimatedReorderCost: round(reorder.reduce((s, r) => s + r.estimatedCost, 0), 2),
      overstockCount: overstock.length,
      overstockValue: round(overstock.reduce((s, r) => s + r.excessValue, 0), 2),
      expiryRiskCount: expiry.length,
      expiryRiskValue: round(expiry.reduce((s, r) => s + (r.atRiskValue || 0), 0), 2),
      insufficientDataCount: analyses.filter((a) => a.forecast.dataQuality.level === 'insufficient').length,
    },
    reorder,
    overstock,
    expiry,
    analysis,
  };
}

/** Detailed forecast for one item (includes the daily series and moving-average line for charts). */
export async function getItemForecast(hotelId, itemId, { now = new Date() } = {}) {
  const hotel = await Hotel.findById(hotelId).lean();
  const settings = hotel?.settings || {};
  const item = await InventoryItem.findOne({ _id: itemId, hotelId, isArchived: false })
    .populate('supplier', 'name leadTimeDays status')
    .populate('category', 'name color')
    .lean();
  if (!item) throw ApiError.notFound('Inventory item not found');

  const windowStart = subDays(startOfDay(now), settings.forecastWindowDays ?? 30);
  const [{ byItem, firstDates }, openOrders] = await Promise.all([
    loadConsumption(hotelId, [item._id], windowStart),
    loadOpenOrders(hotelId, [item._id]),
  ]);
  const k = String(item._id);
  const analysis = analyzeItem(item, byItem.get(k) || [], firstDates.get(k), settings, now, openOrders.get(k) || NO_ORDERS);

  // 90-day history for the chart (separate from the analysis window).
  const chartStart = subDays(startOfDay(now), 89);
  const chartRecords = await ConsumptionRecord.find({ hotelId, item: item._id, date: { $gte: chartStart } }).select('date quantity').lean();
  const first = firstDates.get(String(item._id));
  const chartSeries = buildDailySeries(chartRecords, maxDate([chartStart, startOfDay(first || item.createdAt)]), subDays(startOfDay(now), 1));
  const ma7 = movingAverageSeries(chartSeries.map((d) => d.quantity), 7);
  const history = chartSeries.map((d, i) => ({ ...d, movingAverage7: ma7[i] == null ? null : round(ma7[i], 2) }));
  const projection = Array.from({ length: analysis.forecast.horizonDays }, (_, i) => ({
    date: format(addDays(startOfDay(now), i), 'yyyy-MM-dd'),
    forecast: analysis.forecast.avgDailyDemand,
  }));

  const { series, ...rest } = analysis;
  return { ...rest, history, projection };
}
