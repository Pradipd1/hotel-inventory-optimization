import { Hotel, InventoryItem, PurchaseOrder, Supplier, nextReference } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { MOVEMENT_TYPES, PO_STATUS as S, ROLES, SEVERITY } from '../utils/constants.js';
import { roundMoney, roundQty } from '../utils/helpers.js';
import { runInTransaction } from '../utils/transaction.js';
import { afterStockChange, recordMovement } from './stockService.js';
import { notifyPoStatus, openPoApprovalAlert, resolvePoApprovalAlert } from './alertService.js';

/** Allowed workflow transitions: action -> { from, to, roles }. */
export const TRANSITIONS = {
  submit: { from: [S.DRAFT], to: S.PENDING_APPROVAL, roles: [ROLES.ADMIN, ROLES.MANAGER] },
  approve: { from: [S.PENDING_APPROVAL], to: S.APPROVED, roles: [ROLES.ADMIN] },
  reject: { from: [S.PENDING_APPROVAL], to: S.DRAFT, roles: [ROLES.ADMIN] },
  order: { from: [S.APPROVED], to: S.ORDERED, roles: [ROLES.ADMIN, ROLES.MANAGER] },
  cancel: { from: [S.DRAFT, S.PENDING_APPROVAL, S.APPROVED, S.ORDERED], to: S.CANCELLED, roles: [ROLES.ADMIN, ROLES.MANAGER] },
};

export function calculateTotals(lines, taxRate = 0) {
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
  const taxAmount = roundMoney((subtotal * (taxRate || 0)) / 100);
  return { subtotal, taxRate: taxRate || 0, taxAmount, total: roundMoney(subtotal + taxAmount) };
}

async function buildLines(hotelId, lines) {
  const ids = lines.map((l) => String(l.item));
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each item can only appear once per purchase order');
  const items = await InventoryItem.find({ _id: { $in: ids }, hotelId, isArchived: false }).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw ApiError.badRequest('One or more items were not found', missing.map((id) => ({ field: 'items', message: `Item ${id} not found` })));
  return lines.map((l) => {
    const it = byId.get(String(l.item));
    const quantity = roundQty(l.quantity);
    const unitPrice = roundMoney(l.unitPrice ?? it.unitCost);
    return { item: it._id, itemName: it.name, sku: it.sku, unit: it.unit, quantity, unitPrice, lineTotal: roundMoney(quantity * unitPrice), receivedQuantity: 0 };
  });
}

async function assertSupplier(hotelId, supplierId) {
  const supplier = await Supplier.findOne({ _id: supplierId, hotelId }).lean();
  if (!supplier) throw ApiError.badRequest('Supplier not found');
  if (supplier.status !== 'active') throw ApiError.badRequest(`${supplier.name} is inactive. Activate the supplier or choose another.`);
  return supplier;
}

export async function getPurchaseOrder(hotelId, id) {
  const po = await PurchaseOrder.findOne({ _id: id, hotelId })
    .populate('supplier', 'name companyName contactPerson email phone paymentTerms leadTimeDays')
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name')
    .lean();
  if (!po) throw ApiError.notFound('Purchase order not found');
  return po;
}

export async function createPurchaseOrder(user, data, { source = 'manual' } = {}) {
  await assertSupplier(user.hotelId, data.supplier);
  const lines = await buildLines(user.hotelId, data.items);
  const hotel = await Hotel.findById(user.hotelId).lean();
  const taxRate = data.taxRate ?? hotel?.settings?.defaultTaxRate ?? 0;
  const po = await PurchaseOrder.create({
    hotelId: user.hotelId,
    poNumber: await nextReference(user.hotelId, 'PO'),
    supplier: data.supplier,
    items: lines,
    ...calculateTotals(lines, taxRate),
    notes: data.notes,
    expectedDeliveryDate: data.expectedDeliveryDate,
    source,
    status: S.DRAFT,
    createdBy: user.id,
    statusHistory: [{ status: S.DRAFT, by: user.id, byName: user.name, note: source === 'optimization' ? 'Created from optimization recommendations' : undefined }],
  });
  return po;
}

export async function updatePurchaseOrder(user, id, data) {
  const po = await PurchaseOrder.findOne({ _id: id, hotelId: user.hotelId });
  if (!po) throw ApiError.notFound('Purchase order not found');
  if (po.status !== S.DRAFT) throw ApiError.conflict('Only draft purchase orders can be edited');
  if (data.supplier) await assertSupplier(user.hotelId, data.supplier);
  const lines = data.items ? await buildLines(user.hotelId, data.items) : po.items;
  po.set({
    supplier: data.supplier ?? po.supplier,
    items: lines,
    notes: data.notes ?? po.notes,
    expectedDeliveryDate: data.expectedDeliveryDate !== undefined ? data.expectedDeliveryDate : po.expectedDeliveryDate,
    ...calculateTotals(lines, data.taxRate ?? po.taxRate),
  });
  await po.save();
  return po;
}

export async function transitionPurchaseOrder(user, id, action, note) {
  const rule = TRANSITIONS[action];
  if (!rule) throw ApiError.badRequest('Unknown action');
  if (!rule.roles.includes(user.role)) throw ApiError.forbidden(`Your role cannot ${action} purchase orders`);

  const po = await PurchaseOrder.findOne({ _id: id, hotelId: user.hotelId });
  if (!po) throw ApiError.notFound('Purchase order not found');
  if (!rule.from.includes(po.status)) {
    throw ApiError.conflict(`Cannot ${action} a purchase order that is ${po.status.replace('_', ' ')}`);
  }
  if (action === 'cancel' && po.items.some((l) => l.receivedQuantity > 0)) {
    throw ApiError.conflict('Stock has already been received against this order, so it cannot be cancelled');
  }
  if (action === 'submit') await assertSupplier(user.hotelId, po.supplier);

  const now = new Date();
  po.status = rule.to;
  if (action === 'approve') { po.approvedBy = user.id; po.approvedAt = now; }
  if (action === 'order') po.orderedAt = now;
  if (action === 'cancel') po.cancelledAt = now;
  po.statusHistory.push({ status: rule.to, at: now, by: user.id, byName: user.name, note: note || (action === 'reject' ? 'Returned to draft' : undefined) });
  await po.save();

  if (action === 'submit') await openPoApprovalAlert(po, user.name);
  if (['approve', 'reject', 'cancel'].includes(action)) await resolvePoApprovalAlert(po);
  if (action === 'approve') await notifyPoStatus(po, `${po.poNumber} approved`, `${user.name} approved ${po.poNumber}. It can now be placed with the supplier.`);
  if (action === 'reject') await notifyPoStatus(po, `${po.poNumber} returned to draft`, `${user.name} rejected ${po.poNumber}${note ? `: ${note}` : '.'}`, SEVERITY.WARNING);
  return po;
}

/**
 * Records goods received against an ordered PO: increases stock through Stock In movements
 * (one per line) and updates received quantities and status, all in one transaction.
 */
export async function receivePurchaseOrder(user, id, { idempotencyKey, lines, notes }) {
  const receiptNo = await nextReference(user.hotelId, 'GRN');

  const { po, results } = await runInTransaction(async (session) => {
    const order = await PurchaseOrder.findOne({ _id: id, hotelId: user.hotelId }).session(session);
    if (!order) throw ApiError.notFound('Purchase order not found');
    if (order.receipts.some((r) => r.idempotencyKey === idempotencyKey)) {
      throw ApiError.conflict('This delivery has already been recorded. Stock was not added twice.');
    }
    if (![S.ORDERED, S.PARTIALLY_RECEIVED].includes(order.status)) {
      throw ApiError.conflict(`Stock can only be received for ordered purchase orders (current status: ${order.status.replace('_', ' ')})`);
    }

    const receiptLines = [];
    for (const { lineId, quantity } of lines) {
      const qty = roundQty(quantity);
      if (qty === 0) continue;
      const line = order.items.id(lineId);
      if (!line) throw ApiError.badRequest(`Line ${lineId} is not on this purchase order`);
      const remaining = roundQty(line.quantity - line.receivedQuantity);
      if (qty > remaining) {
        throw ApiError.badRequest(`Cannot receive ${qty} ${line.unit} of ${line.itemName}: only ${remaining} ${line.unit} outstanding`);
      }
      line.receivedQuantity = roundQty(line.receivedQuantity + qty);
      receiptLines.push({ lineId: line._id, item: line.item, itemName: line.itemName, quantity: qty, unitPrice: line.unitPrice });
    }
    if (!receiptLines.length) throw ApiError.badRequest('Enter a received quantity for at least one item');

    const fullyReceived = order.items.every((l) => l.receivedQuantity >= l.quantity);
    const now = new Date();
    order.status = fullyReceived ? S.RECEIVED : S.PARTIALLY_RECEIVED;
    if (fullyReceived) order.receivedAt = now;
    order.receipts.push({ receiptNo, idempotencyKey, receivedAt: now, receivedBy: user.id, receivedByName: user.name, notes, lines: receiptLines });
    order.statusHistory.push({ status: order.status, at: now, by: user.id, byName: user.name, note: `${receiptNo}: received ${receiptLines.length} line(s)` });
    // Version check: a concurrent receive of the same PO fails here instead of double-counting.
    await order.save({ session });

    const movementResults = [];
    for (const l of receiptLines) {
      movementResults.push(
        await recordMovement(
          {
            hotelId: user.hotelId,
            user,
            itemId: l.item,
            type: MOVEMENT_TYPES.IN,
            quantity: l.quantity,
            unitCost: l.unitPrice,
            purchaseOrderId: order._id,
            referenceNo: receiptNo,
            reason: `Received against ${order.poNumber}`,
          },
          { session }
        )
      );
    }
    return { po: order, results: movementResults };
  });

  await afterStockChange(user.hotelId, results);
  await notifyPoStatus(
    po,
    `${po.poNumber} ${po.status === S.RECEIVED ? 'fully received' : 'partially received'}`,
    `${user.name} recorded ${receiptNo} with ${results.length} item(s).`
  );
  return { po, receiptNo, movements: results.map((r) => r.movement) };
}

/**
 * Creates draft POs (one per supplier) from recommendation lines the user confirmed.
 * Nothing is ordered automatically: drafts still go through approval.
 */
export async function createFromRecommendations(user, lines) {
  const items = await InventoryItem.find({ _id: { $in: lines.map((l) => l.item) }, hotelId: user.hotelId, isArchived: false }).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const withoutSupplier = lines.filter((l) => !byId.get(String(l.item))?.supplier);
  if (withoutSupplier.length) {
    const names = withoutSupplier.map((l) => byId.get(String(l.item))?.name ?? l.item).join(', ');
    throw ApiError.badRequest(`Assign a supplier before ordering: ${names}`);
  }
  const groups = new Map();
  for (const l of lines) {
    const supplierId = String(byId.get(String(l.item)).supplier);
    if (!groups.has(supplierId)) groups.set(supplierId, []);
    groups.get(supplierId).push({ item: l.item, quantity: l.quantity });
  }
  const created = [];
  for (const [supplier, poLines] of groups) {
    created.push(await createPurchaseOrder(user, { supplier, items: poLines, notes: 'Generated from inventory optimization recommendations' }, { source: 'optimization' }));
  }
  return created;
}
