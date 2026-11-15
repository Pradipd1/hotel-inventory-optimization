import { PurchaseOrder } from '../models/index.js';
import { escapeRegex, pageMeta, paginate } from '../utils/helpers.js';
import { audit } from '../services/auditService.js';
import * as poService from '../services/purchaseOrderService.js';

export async function list(req, res) {
  const q = req.validated.query;
  const { page, limit, skip } = paginate(q);
  const filter = { hotelId: req.user.hotelId };
  if (q.status) filter.status = q.status;
  if (q.supplier) filter.supplier = q.supplier;
  if (q.search) filter.poNumber = new RegExp(escapeRegex(q.search), 'i');
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(`${q.to.slice(0, 10)}T23:59:59.999`);
  }
  const [rows, total, statusCounts] = await Promise.all([
    PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-receipts -statusHistory')
      .populate('supplier', 'name')
      .populate('createdBy', 'name')
      .lean(),
    PurchaseOrder.countDocuments(filter),
    PurchaseOrder.aggregate([{ $match: { hotelId: req.user.hotelId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  res.json({
    success: true,
    data: rows,
    meta: { ...pageMeta(total, { page, limit }), statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])) },
  });
}

export async function get(req, res) {
  res.json({ success: true, data: await poService.getPurchaseOrder(req.user.hotelId, req.validated.params.id) });
}

export async function create(req, res) {
  const po = await poService.createPurchaseOrder(req.user, req.body);
  await audit(req, { action: 'po.create', entityType: 'PurchaseOrder', entityId: po._id, summary: `Created ${po.poNumber} (total ${po.total})` });
  res.status(201).json({ success: true, data: po, message: `${po.poNumber} created as draft` });
}

export async function update(req, res) {
  const po = await poService.updatePurchaseOrder(req.user, req.validated.params.id, req.body);
  await audit(req, { action: 'po.update', entityType: 'PurchaseOrder', entityId: po._id, summary: `Updated ${po.poNumber}` });
  res.json({ success: true, data: po, message: `${po.poNumber} updated` });
}

const MESSAGES = {
  submit: 'submitted for approval',
  approve: 'approved',
  reject: 'returned to draft',
  order: 'marked as ordered',
  cancel: 'cancelled',
};

export function transition(action) {
  return async (req, res) => {
    const po = await poService.transitionPurchaseOrder(req.user, req.validated.params.id, action, req.body?.note);
    await audit(req, { action: `po.${action}`, entityType: 'PurchaseOrder', entityId: po._id, summary: `${po.poNumber} ${MESSAGES[action]}`, metadata: { note: req.body?.note } });
    res.json({ success: true, data: po, message: `${po.poNumber} ${MESSAGES[action]}` });
  };
}

export async function receive(req, res) {
  const { po, receiptNo, movements } = await poService.receivePurchaseOrder(req.user, req.validated.params.id, req.body);
  await audit(req, {
    action: 'po.receive',
    entityType: 'PurchaseOrder',
    entityId: po._id,
    summary: `${receiptNo}: received ${movements.length} line(s) on ${po.poNumber}`,
    metadata: { receiptNo, lines: movements.map((m) => ({ item: m.itemName, quantity: m.quantity })) },
  });
  res.json({ success: true, data: po, message: `${receiptNo} recorded. ${movements.length} item(s) added to stock.` });
}
