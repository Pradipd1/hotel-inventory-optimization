import { InventoryItem, PurchaseOrder, Supplier } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { PO_STATUS } from '../utils/constants.js';
import { escapeRegex, pageMeta, paginate } from '../utils/helpers.js';
import { audit } from '../services/auditService.js';

export async function list(req, res) {
  const q = req.validated.query;
  const { page, limit, skip } = paginate(q);
  const filter = { hotelId: req.user.hotelId };
  if (q.status) filter.status = q.status;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: rx }, { companyName: rx }, { contactPerson: rx }, { email: rx }];
  }
  const [rows, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).collation({ locale: 'en' }).skip(skip).limit(limit).lean(),
    Supplier.countDocuments(filter),
  ]);
  const ids = rows.map((r) => r._id);
  const [itemCounts, poStats] = await Promise.all([
    InventoryItem.aggregate([
      { $match: { hotelId: req.user.hotelId, isArchived: false, supplier: { $in: ids } } },
      { $group: { _id: '$supplier', count: { $sum: 1 } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { hotelId: req.user.hotelId, supplier: { $in: ids }, status: { $ne: PO_STATUS.CANCELLED } } },
      { $group: { _id: '$supplier', orders: { $sum: 1 }, totalValue: { $sum: '$total' } } },
    ]),
  ]);
  const ic = new Map(itemCounts.map((c) => [String(c._id), c.count]));
  const ps = new Map(poStats.map((c) => [String(c._id), c]));
  res.json({
    success: true,
    data: rows.map((s) => ({
      ...s,
      productCount: ic.get(String(s._id)) ?? 0,
      orderCount: ps.get(String(s._id))?.orders ?? 0,
      totalPurchased: ps.get(String(s._id))?.totalValue ?? 0,
    })),
    meta: pageMeta(total, { page, limit }),
  });
}

export async function get(req, res) {
  const supplier = await Supplier.findOne({ _id: req.validated.params.id, hotelId: req.user.hotelId }).lean();
  if (!supplier) throw ApiError.notFound('Supplier not found');
  const [products, orders] = await Promise.all([
    InventoryItem.find({ hotelId: req.user.hotelId, supplier: supplier._id, isArchived: false })
      .select('name sku unit currentStock reorderPoint unitCost category')
      .populate('category', 'name')
      .sort({ name: 1 })
      .lean(),
    PurchaseOrder.find({ hotelId: req.user.hotelId, supplier: supplier._id })
      .select('poNumber status total createdAt receivedAt items.itemName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);
  const completed = orders.filter((o) => o.status !== PO_STATUS.CANCELLED);
  res.json({
    success: true,
    data: {
      ...supplier,
      products,
      purchaseHistory: orders,
      stats: {
        totalOrders: completed.length,
        totalPurchased: Math.round(completed.reduce((s, o) => s + o.total, 0) * 100) / 100,
        receivedOrders: orders.filter((o) => o.status === PO_STATUS.RECEIVED).length,
        openOrders: orders.filter((o) => ![PO_STATUS.RECEIVED, PO_STATUS.CANCELLED].includes(o.status)).length,
      },
    },
  });
}

export async function create(req, res) {
  const supplier = await Supplier.create({ ...req.body, hotelId: req.user.hotelId });
  await audit(req, { action: 'supplier.create', entityType: 'Supplier', entityId: supplier._id, summary: `Created supplier ${supplier.name}` });
  res.status(201).json({ success: true, data: supplier, message: 'Supplier created' });
}

export async function update(req, res) {
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.validated.params.id, hotelId: req.user.hotelId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!supplier) throw ApiError.notFound('Supplier not found');
  await audit(req, { action: 'supplier.update', entityType: 'Supplier', entityId: supplier._id, summary: `Updated supplier ${supplier.name}` });
  res.json({ success: true, data: supplier, message: 'Supplier updated' });
}

/** Deletion is only allowed when nothing references the supplier; otherwise deactivate it. */
export async function remove(req, res) {
  const { id } = req.validated.params;
  const [items, orders] = await Promise.all([
    InventoryItem.countDocuments({ hotelId: req.user.hotelId, supplier: id, isArchived: false }),
    PurchaseOrder.countDocuments({ hotelId: req.user.hotelId, supplier: id }),
  ]);
  if (items || orders) {
    throw ApiError.conflict(
      `Supplier is linked to ${items} item(s) and ${orders} purchase order(s). Set the supplier to inactive instead to keep purchase history.`
    );
  }
  const supplier = await Supplier.findOneAndDelete({ _id: id, hotelId: req.user.hotelId });
  if (!supplier) throw ApiError.notFound('Supplier not found');
  await InventoryItem.updateMany({ hotelId: req.user.hotelId, supplier: id }, { $set: { supplier: null } });
  await audit(req, { action: 'supplier.delete', entityType: 'Supplier', entityId: supplier._id, summary: `Deleted supplier ${supplier.name}` });
  res.json({ success: true, message: 'Supplier deleted' });
}
