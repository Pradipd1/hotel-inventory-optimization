import { Category, InventoryItem } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from '../services/auditService.js';

export async function list(req, res) {
  const categories = await Category.find({ hotelId: req.user.hotelId }).sort({ name: 1 }).lean();
  const counts = await InventoryItem.aggregate([
    { $match: { hotelId: req.user.hotelId, isArchived: false } },
    { $group: { _id: '$category', itemCount: { $sum: 1 }, stockValue: { $sum: { $multiply: ['$currentStock', '$unitCost'] } } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  res.json({
    success: true,
    data: categories.map((c) => ({
      ...c,
      itemCount: byId.get(String(c._id))?.itemCount ?? 0,
      stockValue: Math.round((byId.get(String(c._id))?.stockValue ?? 0) * 100) / 100,
    })),
  });
}

export async function create(req, res) {
  const category = await Category.create({ ...req.body, hotelId: req.user.hotelId });
  await audit(req, { action: 'category.create', entityType: 'Category', entityId: category._id, summary: `Created category ${category.name}` });
  res.status(201).json({ success: true, data: category, message: 'Category created' });
}

export async function update(req, res) {
  const category = await Category.findOneAndUpdate(
    { _id: req.validated.params.id, hotelId: req.user.hotelId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!category) throw ApiError.notFound('Category not found');
  await audit(req, { action: 'category.update', entityType: 'Category', entityId: category._id, summary: `Updated category ${category.name}` });
  res.json({ success: true, data: category, message: 'Category updated' });
}

export async function remove(req, res) {
  const { id } = req.validated.params;
  const inUse = await InventoryItem.countDocuments({ hotelId: req.user.hotelId, category: id });
  if (inUse) throw ApiError.conflict(`Category is used by ${inUse} item(s) and cannot be deleted. Move those items first.`);
  const category = await Category.findOneAndDelete({ _id: id, hotelId: req.user.hotelId });
  if (!category) throw ApiError.notFound('Category not found');
  await audit(req, { action: 'category.delete', entityType: 'Category', entityId: category._id, summary: `Deleted category ${category.name}` });
  res.json({ success: true, message: 'Category deleted' });
}
