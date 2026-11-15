import mongoose from 'mongoose';

/** Escape user input before using it inside a RegExp (prevents ReDoS / regex injection). */
export function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toObjectId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export function roundQty(n, decimals = 3) {
  const f = 10 ** decimals;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

export function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function paginate({ page = 1, limit = 20 }) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function pageMeta(total, { page, limit }) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
