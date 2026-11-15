import { ConsumptionRecord, Hotel, InventoryItem, StockMovement, nextReference } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { MOVEMENT_TYPES } from '../utils/constants.js';
import { roundMoney, roundQty } from '../utils/helpers.js';
import { runInTransaction } from '../utils/transaction.js';
import { evaluateItemAlerts, notifySignificantAdjustment } from './alertService.js';

/** Signed stock effect of a movement. Adjustments and returns can go either way. */
export function movementDelta(type, quantity, direction) {
  switch (type) {
    case MOVEMENT_TYPES.IN:
      return quantity;
    case MOVEMENT_TYPES.OUT:
    case MOVEMENT_TYPES.WASTAGE:
      return -quantity;
    case MOVEMENT_TYPES.ADJUSTMENT:
    case MOVEMENT_TYPES.RETURN:
      if (direction !== 'increase' && direction !== 'decrease') {
        throw ApiError.badRequest(`Direction (increase or decrease) is required for ${type}`);
      }
      return direction === 'increase' ? quantity : -quantity;
    case MOVEMENT_TYPES.TRANSFER:
      return 0;
    default:
      throw ApiError.badRequest(`Unknown movement type: ${type}`);
  }
}

/**
 * Applies one stock movement. Must be called with the session of an open transaction
 * (or null on a standalone server). Guarantees:
 *  - stock never goes negative: the decrement is a single atomic update whose filter
 *    requires currentStock >= quantity, so concurrent requests cannot oversell;
 *  - every change creates a StockMovement with before/after balances;
 *  - every Stock Out also creates a ConsumptionRecord (the forecasting input).
 */
export async function recordMovement(input, { session = null } = {}) {
  const {
    hotelId, user, itemId, type, direction, reason, referenceNo, department,
    toLocation, purchaseOrderId, unitCost, occurredAt,
  } = input;
  const quantity = roundQty(input.quantity);
  if (!(quantity > 0)) throw ApiError.badRequest('Quantity must be greater than zero');

  const existing = await InventoryItem.findOne({ _id: itemId, hotelId, isArchived: false }).session(session).lean();
  if (!existing) throw ApiError.notFound('Inventory item not found');

  const delta = movementDelta(type, quantity, direction);
  const filter = { _id: itemId, hotelId, isArchived: false };
  const update = { $set: { updatedBy: user.id } };
  let fromLocation;

  if (type === MOVEMENT_TYPES.TRANSFER) {
    if (!toLocation) throw ApiError.badRequest('Destination location is required for a transfer');
    if (toLocation.trim().toLowerCase() === (existing.location || '').trim().toLowerCase()) {
      throw ApiError.badRequest('Destination must differ from the current storage location');
    }
    if (quantity > existing.currentStock) {
      throw ApiError.badRequest(`Cannot transfer ${quantity} ${existing.unit}; only ${existing.currentStock} in stock`);
    }
    fromLocation = existing.location;
    filter.currentStock = { $gte: quantity };
    // Items hold one storage location: a full transfer relocates the item.
    if (quantity === existing.currentStock) update.$set.location = toLocation.trim();
  } else {
    update.$inc = { currentStock: delta };
    if (delta < 0) filter.currentStock = { $gte: -delta };
  }

  const updated = await InventoryItem.findOneAndUpdate(filter, update, { new: true, session, runValidators: true }).lean();
  if (!updated) {
    const current = await InventoryItem.findById(itemId).session(session).lean();
    throw ApiError.badRequest(
      `Insufficient stock for ${existing.name}: requested ${quantity} ${existing.unit}, available ${current?.currentStock ?? 0} ${existing.unit}. Stock cannot go negative.`
    );
  }

  // Remove floating-point noise from repeated decimal increments (e.g. 0.1 + 0.2).
  const balanceAfter = roundQty(updated.currentStock);
  if (balanceAfter !== updated.currentStock) {
    await InventoryItem.updateOne({ _id: itemId }, { $set: { currentStock: balanceAfter } }, { session });
    updated.currentStock = balanceAfter;
  }
  const balanceBefore = roundQty(balanceAfter - delta);
  const cost = unitCost ?? existing.unitCost ?? 0;
  const when = occurredAt ? new Date(occurredAt) : new Date();

  const [movement] = await StockMovement.create(
    [
      {
        hotelId,
        item: itemId,
        itemName: existing.name,
        sku: existing.sku,
        unit: existing.unit,
        type,
        quantity,
        change: delta,
        balanceBefore,
        balanceAfter,
        unitCost: cost,
        totalValue: roundMoney(quantity * cost),
        reason,
        referenceNo: referenceNo || (await nextReference(hotelId, 'MV', 6)),
        department,
        fromLocation: fromLocation ?? existing.location,
        toLocation: type === MOVEMENT_TYPES.TRANSFER ? toLocation.trim() : undefined,
        purchaseOrder: purchaseOrderId || null,
        performedBy: user.id,
        performedByName: user.name,
        occurredAt: when,
      },
    ],
    { session }
  );

  if (type === MOVEMENT_TYPES.OUT) {
    await ConsumptionRecord.create(
      [
        {
          hotelId,
          item: itemId,
          category: existing.category,
          quantity,
          unitCost: cost,
          department,
          date: when,
          movement: movement._id,
          recordedBy: user.id,
        },
      ],
      { session }
    );
  }

  return { movement: movement.toObject(), item: updated, previousItem: existing };
}

/**
 * Records a single movement in its own transaction, then refreshes alerts.
 * Alert generation runs after commit so a notification failure never rolls back stock.
 */
export async function executeMovement(input) {
  if (!input.referenceNo) input.referenceNo = await nextReference(input.hotelId, 'MV', 6);
  const result = await runInTransaction((session) => recordMovement(input, { session }));
  await afterStockChange(input.hotelId, [result]);
  return result;
}

/** Post-commit side effects for one or more movements. */
export async function afterStockChange(hotelId, results) {
  try {
    const hotel = await Hotel.findById(hotelId).lean();
    const settings = hotel?.settings || {};
    for (const { item, movement } of results) {
      await evaluateItemAlerts(item, settings);
      if (movement.type === MOVEMENT_TYPES.ADJUSTMENT) {
        await notifySignificantAdjustment(movement, settings);
      }
    }
  } catch (err) {
    console.error('Alert evaluation failed:', err.message);
  }
}
