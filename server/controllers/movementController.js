import { InventoryItem, StockMovement } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { MOVEMENT_TYPES, ROLES } from '../utils/constants.js';
import { escapeRegex, pageMeta, paginate } from '../utils/helpers.js';
import { audit } from '../services/auditService.js';
import { executeMovement } from '../services/stockService.js';
import { assertItemVisible, categoryRestriction } from '../services/inventoryService.js';

// Staff may only record consumption ("authorized stock consumption").
const STAFF_ALLOWED = [MOVEMENT_TYPES.OUT];

export async function buildMovementFilter(user, q) {
  const filter = { hotelId: user.hotelId };
  if (q.item) filter.item = q.item;
  if (q.type) filter.type = q.type;
  if (q.from || q.to) {
    filter.occurredAt = {};
    if (q.from) filter.occurredAt.$gte = new Date(q.from);
    if (q.to) {
      const to = new Date(q.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setHours(23, 59, 59, 999);
      filter.occurredAt.$lte = to;
    }
  }
  const allowed = categoryRestriction(user);
  if (q.category || allowed) {
    const catFilter = q.category ? (allowed && !allowed.includes(q.category) ? [] : [q.category]) : allowed;
    const ids = await InventoryItem.find({ hotelId: user.hotelId, category: { $in: catFilter } }).distinct('_id');
    filter.item = q.item ? (ids.some((i) => String(i) === q.item) ? q.item : null) : { $in: ids };
  }
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ itemName: rx }, { sku: rx }, { referenceNo: rx }, { reason: rx }];
  }
  return filter;
}

export async function list(req, res) {
  const q = req.validated.query;
  const { page, limit, skip } = paginate(q);
  const filter = await buildMovementFilter(req.user, q);
  const [rows, total] = await Promise.all([
    StockMovement.find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('purchaseOrder', 'poNumber')
      .lean(),
    StockMovement.countDocuments(filter),
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, { page, limit }) });
}

export async function create(req, res) {
  const body = req.body;
  if (req.user.role === ROLES.STAFF && !STAFF_ALLOWED.includes(body.type)) {
    throw ApiError.forbidden('Staff can only record stock consumption');
  }
  const item = await InventoryItem.findOne({ _id: body.itemId, hotelId: req.user.hotelId, isArchived: false }).lean();
  if (!item) throw ApiError.notFound('Inventory item not found');
  assertItemVisible(req.user, item);

  const { movement, item: updated } = await executeMovement({
    ...body,
    hotelId: req.user.hotelId,
    user: req.user,
  });

  await audit(req, {
    action: `stock.${movement.type}`,
    entityType: 'StockMovement',
    entityId: movement._id,
    summary: `${movement.type.replace('_', ' ')} ${movement.quantity} ${movement.unit} of ${movement.itemName} (${movement.balanceBefore} → ${movement.balanceAfter})`,
    metadata: { referenceNo: movement.referenceNo, item: movement.item },
  });

  let message = 'Stock movement recorded';
  if (movement.type === MOVEMENT_TYPES.TRANSFER) {
    message = updated.location === movement.toLocation
      ? `All stock moved to ${movement.toLocation}`
      : `Transfer of ${movement.quantity} ${movement.unit} to ${movement.toLocation} recorded. The item's main location stays ${updated.location} because only part of the stock moved.`;
  }
  res.status(201).json({ success: true, data: { movement, item: updated }, message });
}
