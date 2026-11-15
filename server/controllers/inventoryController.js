import fs from 'node:fs/promises';
import path from 'node:path';
import { InventoryItem, StockMovement } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { pageMeta, paginate } from '../utils/helpers.js';
import { audit } from '../services/auditService.js';
import * as inventory from '../services/inventoryService.js';
import { deleteImage, uploadImageBuffer } from '../services/imageStorage.js';

export async function list(req, res) {
  const result = await inventory.listItems(req.user, req.validated.query);
  res.json({ success: true, data: result.items, meta: result.meta });
}

export async function get(req, res) {
  res.json({ success: true, data: await inventory.getItem(req.user, req.validated.params.id) });
}

export async function create(req, res) {
  const item = await inventory.createItem(req.user, req.body);
  await audit(req, {
    action: 'item.create',
    entityType: 'InventoryItem',
    entityId: item._id,
    summary: `Created ${item.name} (${item.sku})${req.body.openingStock ? ` with opening stock ${req.body.openingStock} ${item.unit}` : ''}`,
  });
  res.status(201).json({ success: true, data: item, message: 'Item created' });
}

export async function update(req, res) {
  const { item, changed } = await inventory.updateItem(req.user, req.validated.params.id, req.body);
  await audit(req, {
    action: 'item.update',
    entityType: 'InventoryItem',
    entityId: item._id,
    summary: `Updated ${item.name}${changed.length ? `: ${changed.join(', ')}` : ''}`,
    metadata: { changed },
  });
  res.json({ success: true, data: item, message: 'Item updated' });
}

export async function remove(req, res) {
  const item = await inventory.archiveItem(req.user, req.validated.params.id);
  await audit(req, { action: 'item.archive', entityType: 'InventoryItem', entityId: item._id, summary: `Deleted (archived) ${item.name} (${item.sku})` });
  res.json({ success: true, message: `${item.name} was deleted. Its stock history is retained for reporting.` });
}

export async function history(req, res) {
  const item = await inventory.getItem(req.user, req.validated.params.id);
  const { page, limit, skip } = paginate(req.query);
  const filter = { hotelId: req.user.hotelId, item: item._id };
  const [rows, total] = await Promise.all([
    // Ledger order = the order balances were applied (a backdated entry keeps its own date but
    // sits where it was recorded, so balance before/after always chains).
    StockMovement.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    StockMovement.countDocuments(filter),
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, { page, limit }) });
}

export async function uploadImage(req, res) {
  if (!req.file) throw ApiError.badRequest('No image uploaded');
  const item = await InventoryItem.findOne({ _id: req.validated.params.id, hotelId: req.user.hotelId, isArchived: false }).select('+imagePublicId');
  if (!item) {
    if (req.file.path) await fs.unlink(req.file.path).catch(() => {});
    throw ApiError.notFound('Inventory item not found');
  }
  const old = item.image;
  const oldPublicId = item.imagePublicId;
  if (env.cloudinaryUrl) {
    const uploaded = await uploadImageBuffer(req.file.buffer, String(req.user.hotelId));
    item.image = uploaded.url;
    item.imagePublicId = uploaded.publicId;
  } else {
    item.image = `/uploads/${req.file.filename}`;
    item.imagePublicId = null;
  }
  item.updatedBy = req.user.id;
  await item.save();
  if (oldPublicId) await deleteImage(oldPublicId);
  if (old?.startsWith('/uploads/')) await fs.unlink(path.join(env.uploadDir, path.basename(old))).catch(() => {});
  await audit(req, { action: 'item.image', entityType: 'InventoryItem', entityId: item._id, summary: `Updated image for ${item.name}` });
  res.json({ success: true, data: { image: item.image }, message: 'Image uploaded' });
}
