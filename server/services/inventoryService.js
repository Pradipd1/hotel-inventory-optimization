import { Category, Hotel, InventoryItem, PurchaseOrder, Supplier, nextReference } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { MOVEMENT_TYPES, OPEN_PO_STATUS, ROLES } from '../utils/constants.js';
import { escapeRegex, pageMeta, paginate } from '../utils/helpers.js';
import { runInTransaction } from '../utils/transaction.js';
import { decorateItem, statusFilter } from './inventoryStatus.js';
import { afterStockChange, recordMovement } from './stockService.js';
import { evaluateItemAlerts } from './alertService.js';

export async function getHotelSettings(hotelId) {
  const hotel = await Hotel.findById(hotelId).lean();
  return hotel?.settings || {};
}

/** Staff with assigned categories only see those categories ("assigned inventory"). */
export function categoryRestriction(user) {
  if (user.role === ROLES.STAFF && user.assignedCategories?.length) return user.assignedCategories.map(String);
  return null;
}

export function assertItemVisible(user, item) {
  const allowed = categoryRestriction(user);
  const categoryId = String(item.category?._id ?? item.category);
  if (allowed && !allowed.includes(categoryId)) {
    throw ApiError.forbidden('This item is not in your assigned inventory');
  }
}

async function assertReferences(hotelId, { category, supplier }) {
  if (category && !(await Category.exists({ _id: category, hotelId }))) {
    throw ApiError.badRequest('Category not found');
  }
  if (supplier && !(await Supplier.exists({ _id: supplier, hotelId }))) {
    throw ApiError.badRequest('Supplier not found');
  }
}

export async function listItems(user, query) {
  const settings = await getHotelSettings(user.hotelId);
  const { page, limit, skip } = paginate(query);
  const filter = { hotelId: user.hotelId, isArchived: false, ...statusFilter(query.status, settings) };

  const allowed = categoryRestriction(user);
  if (query.category) {
    if (allowed && !allowed.includes(query.category)) return { items: [], meta: pageMeta(0, { page, limit }) };
    filter.category = query.category;
  } else if (allowed) {
    filter.category = { $in: allowed };
  }
  if (query.supplier) filter.supplier = query.supplier;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { location: rx }];
  }

  const sort = { [query.sort]: query.order === 'desc' ? -1 : 1, _id: 1 };
  const [rows, total] = await Promise.all([
    InventoryItem.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('category', 'name color')
      .populate('supplier', 'name')
      .collation({ locale: 'en' })
      .lean(),
    InventoryItem.countDocuments(filter),
  ]);
  return { items: rows.map((r) => decorateItem(r, settings)), meta: pageMeta(total, { page, limit }) };
}

export async function getItem(user, id) {
  const item = await InventoryItem.findOne({ _id: id, hotelId: user.hotelId, isArchived: false })
    .populate('category', 'name color')
    .populate('supplier', 'name companyName leadTimeDays status phone email')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .lean();
  if (!item) throw ApiError.notFound('Inventory item not found');
  assertItemVisible(user, item);
  return decorateItem(item, await getHotelSettings(user.hotelId));
}

export async function createItem(user, data) {
  await assertReferences(user.hotelId, data);
  const { openingStock = 0, ...fields } = data;
  const referenceNo = openingStock > 0 ? await nextReference(user.hotelId, 'MV', 6) : null;

  const { item, movementResult } = await runInTransaction(async (session) => {
    const [created] = await InventoryItem.create(
      [{ ...fields, hotelId: user.hotelId, currentStock: 0, createdBy: user.id, updatedBy: user.id }],
      { session }
    );
    let result = null;
    if (openingStock > 0) {
      result = await recordMovement(
        {
          hotelId: user.hotelId,
          user,
          itemId: created._id,
          type: MOVEMENT_TYPES.IN,
          quantity: openingStock,
          reason: 'Opening stock',
          referenceNo,
        },
        { session }
      );
    }
    return { item: created, movementResult: result };
  });

  if (movementResult) await afterStockChange(user.hotelId, [movementResult]);
  else await evaluateItemAlerts(item.toObject(), await getHotelSettings(user.hotelId));
  return getItem(user, item._id);
}

export async function updateItem(user, id, data) {
  const item = await InventoryItem.findOne({ _id: id, hotelId: user.hotelId, isArchived: false });
  if (!item) throw ApiError.notFound('Inventory item not found');
  await assertReferences(user.hotelId, data);

  const merged = {
    minStock: data.minStock ?? item.minStock,
    maxStock: data.maxStock ?? item.maxStock,
    reorderPoint: data.reorderPoint ?? item.reorderPoint,
  };
  const issues = [];
  if (merged.maxStock > 0 && merged.minStock > merged.maxStock) issues.push({ field: 'minStock', message: 'Minimum stock cannot exceed maximum stock' });
  if (merged.maxStock > 0 && merged.reorderPoint > merged.maxStock) issues.push({ field: 'reorderPoint', message: 'Reorder point cannot exceed maximum stock' });
  if (issues.length) throw ApiError.badRequest('Validation failed', issues);

  const before = item.toObject();
  item.set({ ...data, updatedBy: user.id });
  await item.save();
  await evaluateItemAlerts(item.toObject(), await getHotelSettings(user.hotelId));

  const changed = Object.keys(data).filter((k) => String(before[k] ?? '') !== String(item[k] ?? ''));
  return { item: await getItem(user, id), changed };
}

/**
 * Items are archived rather than hard-deleted, so stock history, consumption records and
 * purchase orders that reference them stay intact. Items on open purchase orders cannot be removed.
 */
export async function archiveItem(user, id) {
  const item = await InventoryItem.findOne({ _id: id, hotelId: user.hotelId, isArchived: false });
  if (!item) throw ApiError.notFound('Inventory item not found');
  const openPo = await PurchaseOrder.findOne({ hotelId: user.hotelId, status: { $in: ['draft', ...OPEN_PO_STATUS] }, 'items.item': id })
    .select('poNumber')
    .lean();
  if (openPo) throw ApiError.conflict(`Item is on open purchase order ${openPo.poNumber}. Complete or cancel it first.`);
  item.isArchived = true;
  item.archivedAt = new Date();
  item.updatedBy = user.id;
  await item.save();
  await evaluateItemAlerts(item.toObject(), {});
  return item;
}
