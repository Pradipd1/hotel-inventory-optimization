import { z } from 'zod';
import { format } from 'date-fns';
import { InventoryItem } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ALL_MOVEMENT_TYPES, ALL_PO_STATUS, STOCK_STATUS } from '../utils/constants.js';
import { dateString, objectId } from '../validators/common.js';
import { audit } from '../services/auditService.js';
import { getDashboard } from '../services/dashboardService.js';
import { getItemForecast, getRecommendations } from '../services/optimization/optimizationService.js';
import { createFromRecommendations } from '../services/purchaseOrderService.js';
import { evaluateItemAlerts } from '../services/alertService.js';
import { getHotelSettings } from '../services/inventoryService.js';
import { REPORT_LIST, runReport } from '../services/reportService.js';
import { streamPdf, toCsv } from '../services/exportService.js';

// ---------- Dashboard ----------
export async function dashboard(req, res) {
  res.json({ success: true, data: await getDashboard(req.user.hotelId) });
}

// ---------- Optimization ----------
export async function recommendations(req, res) {
  res.json({ success: true, data: await getRecommendations(req.user.hotelId) });
}

export async function itemForecast(req, res) {
  res.json({ success: true, data: await getItemForecast(req.user.hotelId, req.validated.params.id) });
}

/** Saves the calculated reorder point (and optionally safety stock) to the item after user confirmation. */
export async function applyReorderPoint(req, res) {
  const forecast = await getItemForecast(req.user.hotelId, req.validated.params.id);
  if (!forecast.calculatedReorderPoint.canCalculate) {
    throw ApiError.badRequest(`Reorder point cannot be calculated: missing ${forecast.calculatedReorderPoint.missing.join(', ')}`);
  }
  const item = await InventoryItem.findOne({ _id: req.validated.params.id, hotelId: req.user.hotelId });
  const previous = item.reorderPoint;
  const value = Math.ceil(forecast.calculatedReorderPoint.value);
  if (item.maxStock > 0 && value > item.maxStock) {
    throw ApiError.badRequest(`Calculated reorder point (${value}) exceeds the maximum stock level (${item.maxStock}). Raise the maximum first.`);
  }
  item.reorderPoint = value;
  item.updatedBy = req.user.id;
  await item.save();
  await evaluateItemAlerts(item.toObject(), await getHotelSettings(req.user.hotelId));
  await audit(req, {
    action: 'optimization.apply_rop',
    entityType: 'InventoryItem',
    entityId: item._id,
    summary: `Reorder point for ${item.name} changed ${previous} → ${value} (calculated)`,
  });
  res.json({ success: true, data: { reorderPoint: value, previous }, message: `Reorder point updated to ${value} ${item.unit}` });
}

export async function createOrders(req, res) {
  const orders = await createFromRecommendations(req.user, req.body.items);
  for (const po of orders) {
    await audit(req, { action: 'po.create', entityType: 'PurchaseOrder', entityId: po._id, summary: `Created ${po.poNumber} from optimization recommendations` });
  }
  res.status(201).json({
    success: true,
    data: orders.map((o) => ({ _id: o._id, poNumber: o.poNumber, total: o.total, lines: o.items.length })),
    message: `${orders.length} draft purchase order(s) created. Submit them for approval to proceed.`,
  });
}

// ---------- Reports ----------
export const reportQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  category: objectId.optional(),
  item: objectId.optional(),
  supplier: objectId.optional(),
  status: z.enum(Object.values(STOCK_STATUS)).optional(),
  movementType: z.enum(ALL_MOVEMENT_TYPES).optional(),
  poStatus: z.enum(ALL_PO_STATUS).optional(),
  withinDays: z.coerce.number().int().min(1).max(365).optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});

export function listReports(_req, res) {
  res.json({ success: true, data: REPORT_LIST });
}

export async function report(req, res) {
  const { format: fmt, ...filters } = req.validated.query;
  const result = await runReport(req.user.hotelId, req.params.key, filters);
  const filename = `${req.params.key}-report-${format(new Date(), 'yyyyMMdd-HHmm')}`;

  if (fmt !== 'json') {
    await audit(req, { action: 'report.export', entityType: 'Report', summary: `Exported ${result.title} as ${fmt.toUpperCase()}`, metadata: { filters } });
  }
  if (fmt === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(toCsv(result));
  }
  if (fmt === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return streamPdf(result, res);
  }
  res.json({ success: true, data: result });
}
