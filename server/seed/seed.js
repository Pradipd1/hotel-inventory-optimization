/**
 * Seeds a demo hotel with 120 days of simulated operations.
 *
 * The simulation walks day by day: consumption, wastage, reorders when stock hits the
 * reorder point, deliveries after the supplier lead time. So every movement has consistent
 * before/after balances and the optimization engine has real history to analyse.
 *
 * Usage: npm run seed   (WARNING: deletes all existing data in the configured database)
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { addDays, addMinutes, startOfDay, subDays } from 'date-fns';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  AuditLog, Category, ConsumptionRecord, Counter, Hotel, InventoryItem, Notification,
  PurchaseOrder, StockMovement, Supplier, User,
} from '../models/index.js';
import { MOVEMENT_TYPES as M, PO_STATUS as S } from '../utils/constants.js';
import { roundMoney } from '../utils/helpers.js';
import { notifySignificantAdjustment, openPoApprovalAlert, scanHotelAlerts } from '../services/alertService.js';
import { CATEGORIES, HOTEL, INTEGER_UNITS, ITEMS, SUPPLIERS, USERS } from './data.js';

const DAYS = 120;
const TAX = HOTEL.settings.defaultTaxRate;

// Deterministic PRNG so every seed run produces the same data.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261115);
const between = (lo, hi) => lo + rand() * (hi - lo);
const oid = () => new mongoose.Types.ObjectId();
const r3 = (n) => Math.round(n * 1000) / 1000;

function qtyFor(item, expected) {
  if (INTEGER_UNITS.has(item.unit)) {
    if (expected < 1) return rand() < expected ? 1 : 0; // e.g. 0.4 packs/day
    return Math.round(expected);
  }
  return Math.round(expected * 10) / 10;
}

async function main() {
  if (env.isProduction && !process.argv.includes('--force')) {
    console.error('Refusing to seed in production without --force.');
    process.exit(1);
  }
  await connectDB(env.mongoUri);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`Seeding database "${dbName}" (existing data will be removed)...`);

  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  // Remove product images from previous runs (they belonged to the deleted items).
  for (const f of fs.readdirSync(env.uploadDir, { withFileTypes: true })) {
    if (f.isFile() && f.name !== '.gitkeep') fs.unlinkSync(path.join(env.uploadDir, f.name));
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  const now = new Date();
  const today = startOfDay(now);
  const dayDate = (d) => subDays(today, DAYS - d); // d = 0 .. DAYS-1 (last = yesterday)
  const start = dayDate(0);

  // ---------- Reference data ----------
  const hotel = await Hotel.create(HOTEL);
  const hotelId = hotel._id;

  const categories = await Category.insertMany(CATEGORIES.map((c) => ({ ...c, hotelId })));
  const catByName = new Map(categories.map((c) => [c.name, c]));

  const users = {};
  for (const u of USERS) {
    users[u.key] = await User.create({
      hotelId, name: u.name, email: u.email, password: u.password, role: u.role, department: u.department,
      assignedCategories: (u.assignedCategories || []).map((n) => catByName.get(n)._id),
    });
  }
  const actor = (u) => ({ id: u._id, name: u.name });
  const deptUser = (dept) => (dept === 'Housekeeping' ? users.housekeeping : dept === 'Kitchen' || dept === 'Restaurant' ? users.staff : users.manager);

  const suppliers = {};
  for (const s of SUPPLIERS) {
    const { key, ...data } = s;
    suppliers[key] = await Supplier.create({ ...data, hotelId });
  }

  // Items in an explicit demo PO or with a staged closing stock stop auto-reordering in the
  // last 15 days, so the demo scenarios below are not hidden by simulated deliveries.
  const EXPLICIT_PO_ITEMS = new Set(['FB-FLOUR-01', 'FB-SUGAR-01', 'KS-GLOVE-01', 'CM-DISH-01', 'TL-HANDW-01', 'GR-BEDSH-01', 'OS-A4-01', 'ME-BULB-01']);
  const state = ITEMS.map((def) => ({
    def,
    _id: oid(),
    category: catByName.get(def.category)._id,
    supplier: suppliers[def.supplier],
    stock: 0,
    opening: qtyFor({ unit: 'piece' }, def.maxStock * 0.65),
    pending: false,
    suppressFrom: def.target !== undefined || EXPLICIT_PO_ITEMS.has(def.sku) ? DAYS - 15 : Infinity,
  }));

  const movements = [];
  const consumption = [];
  const pos = [];
  const pendingDeliveries = []; // { arrivalDay, po }

  function addMovement(st, { type, quantity, at, by, reason, unitCost, change, po, referenceNo, dept, toLocation }) {
    const delta = change ?? (type === M.IN ? quantity : type === M.TRANSFER ? 0 : -quantity);
    const before = st.stock;
    const after = r3(before + delta);
    if (after < 0) throw new Error(`Negative stock simulated for ${st.def.name}`);
    st.stock = after;
    const cost = unitCost ?? st.def.unitCost;
    const mv = {
      _id: oid(), hotelId, item: st._id, itemName: st.def.name, sku: st.def.sku, unit: st.def.unit, type,
      quantity: r3(quantity), change: r3(delta), balanceBefore: before, balanceAfter: after, unitCost: cost,
      totalValue: roundMoney(quantity * cost), reason, referenceNo, department: dept,
      fromLocation: st.def.location, toLocation, purchaseOrder: po?._id ?? null,
      performedBy: by._id, performedByName: by.name, occurredAt: at, createdAt: at, updatedAt: at,
    };
    movements.push(mv);
    if (type === M.OUT) {
      consumption.push({
        hotelId, item: st._id, category: st.category, quantity: mv.quantity, unitCost: cost, department: dept,
        date: at, movement: mv._id, recordedBy: by._id, createdAt: at, updatedAt: at,
      });
    }
    return mv;
  }

  function buildPo({ supplier, lines, createdAt, status, history }) {
    const items = lines.map(({ st, quantity, unitPrice }) => ({
      _id: oid(), item: st._id, itemName: st.def.name, sku: st.def.sku, unit: st.def.unit,
      quantity, unitPrice, lineTotal: roundMoney(quantity * unitPrice), receivedQuantity: 0,
    }));
    const subtotal = roundMoney(items.reduce((s, l) => s + l.lineTotal, 0));
    const taxAmount = roundMoney((subtotal * TAX) / 100);
    const po = {
      _id: oid(), hotelId, supplier: supplier._id, items, subtotal, taxRate: TAX, taxAmount, total: roundMoney(subtotal + taxAmount),
      status, createdBy: users.manager._id, statusHistory: history, receipts: [], source: 'manual',
      createdAt, updatedAt: createdAt,
    };
    pos.push(po);
    return po;
  }

  function receive(po, at, linesToReceive) {
    const receiptLines = [];
    const receiptId = oid();
    for (const { line, quantity } of linesToReceive) {
      line.receivedQuantity = r3(line.receivedQuantity + quantity);
      const st = state.find((s) => String(s._id) === String(line.item));
      const mv = addMovement(st, { type: M.IN, quantity, at, by: users.manager, unitCost: line.unitPrice, po, reason: 'Received against PO', referenceNo: `GRN:${receiptId}` });
      receiptLines.push({ lineId: line._id, item: line.item, itemName: line.itemName, quantity, _mv: mv });
    }
    po.receipts.push({ _id: receiptId, idempotencyKey: `seed-${receiptId}`, receivedAt: at, receivedBy: users.manager._id, receivedByName: users.manager.name, lines: receiptLines.map(({ _mv, ...l }) => l) });
    const full = po.items.every((l) => l.receivedQuantity >= l.quantity);
    po.status = full ? S.RECEIVED : S.PARTIALLY_RECEIVED;
    if (full) po.receivedAt = at;
    po.statusHistory.push({ status: po.status, at, by: users.manager._id, byName: users.manager.name, note: 'Goods received' });
    po.updatedAt = at;
  }

  // Opening balances are recorded as movements so every item's stock is fully explained by its ledger.
  for (const st of state) {
    addMovement(st, { type: M.IN, quantity: st.opening, at: addMinutes(dayDate(0), 8 * 60), by: users.manager, reason: 'Opening balance (initial stock count)' });
  }

  // ---------- Day-by-day simulation ----------
  for (let d = 0; d < DAYS; d++) {
    const date = dayDate(d);
    const weekday = date.getDay();

    // 1. Deliveries arrive in the morning.
    for (const del of pendingDeliveries.filter((p) => p.arrivalDay === d)) {
      receive(del.po, addMinutes(date, 9 * 60 + 30), del.po.items.map((line) => ({ line, quantity: line.quantity })));
      for (const line of del.po.items) state.find((s) => String(s._id) === String(line.item)).pending = false;
    }

    // 2. Daily consumption. Fri/Sat are busier; the last 3 weeks are festival season (+12%).
    for (const st of state) {
      const busy = weekday === 5 || weekday === 6 ? 1.25 : 1;
      const season = d >= DAYS - 21 ? 1.12 : 1;
      let qty = qtyFor(st.def, st.def.daily * busy * season * between(0.75, 1.25));
      qty = Math.min(qty, st.stock);
      if (qty > 0) {
        addMovement(st, { type: M.OUT, quantity: qty, at: addMinutes(date, 12 * 60 + Math.floor(rand() * 300)), by: deptUser(st.def.dept), dept: st.def.dept, reason: `Daily issue to ${st.def.dept}` });
      }
      // Perishable wastage.
      if (st.def.wastageEvery && d % st.def.wastageEvery === 7 && st.stock >= 3) {
        addMovement(st, { type: M.WASTAGE, quantity: 3, at: addMinutes(date, 18 * 60), by: users.manager, reason: 'Spoiled: past use-by date' });
      }
    }

    // 3. Occasional events (one of each type for a realistic history).
    const bySku = (sku) => state.find((s) => s.def.sku === sku);
    if (d === 40) addMovement(bySku('FB-RICE-01'), { type: M.WASTAGE, quantity: 6, at: addMinutes(date, 18 * 60 + 10), by: users.manager, reason: 'Pest damage found during inspection' });
    if (d === 70) addMovement(bySku('FB-WATER-01'), { type: M.WASTAGE, quantity: 24, at: addMinutes(date, 18 * 60 + 15), by: users.manager, reason: 'Crushed carton during unloading' });
    if (d === DAYS - 4 && bySku('FB-MILK-01').stock >= 8) addMovement(bySku('FB-MILK-01'), { type: M.WASTAGE, quantity: 8, at: addMinutes(date, 18 * 60 + 5), by: users.manager, reason: 'Spoiled: cold room temperature fault overnight' });
    if (d === 85) addMovement(bySku('GR-SLIP-01'), { type: M.RETURN, quantity: 20, change: 20, at: addMinutes(date, 18 * 60 + 20), by: users.housekeeping, reason: 'Unused stock returned from floor pantries' });
    if (d === DAYS - 12 && bySku('CM-CLEAN-01').stock >= 35) {
      addMovement(bySku('CM-CLEAN-01'), { type: M.ADJUSTMENT, quantity: 30, change: -30, at: addMinutes(date, 19 * 60), by: users.manager, reason: 'Monthly stock count variance: leaking containers found' });
    }
    if (d === DAYS - 6 && bySku('CM-CLEAN-01').stock > 10) {
      addMovement(bySku('CM-CLEAN-01'), { type: M.TRANSFER, quantity: 10, change: 0, at: addMinutes(date, 18 * 60 + 30), by: users.manager, toLocation: 'Floor 3 Housekeeping Pantry', reason: 'Floor pantry top-up' });
    }

    // 4. Evening reorder check: one PO per supplier for items at/below their reorder point.
    const needs = new Map();
    for (const st of state) {
      if (st.pending || d >= st.suppressFrom || st.stock > st.def.reorderPoint || st.supplier.status !== 'active') continue;
      const quantity = Math.round(st.def.maxStock - st.stock);
      if (quantity <= 0) continue;
      if (!needs.has(st.def.supplier)) needs.set(st.def.supplier, []);
      needs.get(st.def.supplier).push({ st, quantity, unitPrice: roundMoney(st.def.unitCost * between(0.97, 1.03)) });
    }
    for (const [key, lines] of needs) {
      const supplier = suppliers[key];
      const createdAt = addMinutes(date, 17 * 60);
      const by = (u, at, status, note) => ({ status, at, by: u._id, byName: u.name, note });
      const po = buildPo({
        supplier, lines, createdAt, status: S.ORDERED,
        history: [
          by(users.manager, createdAt, S.DRAFT),
          by(users.manager, addMinutes(createdAt, 5), S.PENDING_APPROVAL),
          by(users.admin, addMinutes(createdAt, 40), S.APPROVED),
          by(users.manager, addMinutes(createdAt, 60), S.ORDERED),
        ],
      });
      Object.assign(po, { approvedBy: users.admin._id, approvedAt: addMinutes(createdAt, 40), orderedAt: addMinutes(createdAt, 60) });
      const lead = Math.max(...lines.map((l) => l.st.def.leadTimeDays ?? supplier.leadTimeDays));
      pendingDeliveries.push({ arrivalDay: d + lead, po });
      for (const l of lines) l.st.pending = true;
    }
  }

  // ---------- Today: open orders and staged scenarios ----------
  let tick = 0;
  const todayAt = () => addMinutes(today, ++tick); // early today, always before "now"
  const bySku = (sku) => state.find((s) => s.def.sku === sku);
  const hist = (u, at, status, note) => ({ status, at, by: u._id, byName: u.name, note });
  const line = (sku, quantity) => ({ st: bySku(sku), quantity, unitPrice: bySku(sku).def.unitCost });

  // Partially received bedsheet order (10-day lead time).
  const linenAt = subDays(now, 9);
  const linenPo = buildPo({
    supplier: suppliers.linen, lines: [line('GR-BEDSH-01', 60)], createdAt: linenAt, status: S.ORDERED,
    history: [hist(users.manager, linenAt, S.DRAFT), hist(users.manager, linenAt, S.PENDING_APPROVAL), hist(users.admin, addMinutes(linenAt, 30), S.APPROVED), hist(users.manager, addMinutes(linenAt, 50), S.ORDERED)],
  });
  Object.assign(linenPo, { approvedBy: users.admin._id, approvedAt: addMinutes(linenAt, 30), orderedAt: addMinutes(linenAt, 50), notes: 'Replacement of worn linen before peak season' });
  receive(linenPo, todayAt(), [{ line: linenPo.items[0], quantity: 30 }]);

  // Staged closing stock levels (consumption for events, or a bulk purchase for overstock).
  for (const st of state.filter((s) => s.def.target !== undefined)) {
    const diff = r3(st.stock - st.def.target);
    if (diff > 0) addMovement(st, { type: M.OUT, quantity: diff, at: todayAt(), by: deptUser(st.def.dept), dept: st.def.dept, reason: 'Banquet & festival event consumption' });
    if (diff < 0) addMovement(st, { type: M.IN, quantity: -diff, at: todayAt(), by: users.manager, reason: st.def.target > st.def.maxStock ? 'Bulk purchase at festival discount' : 'Emergency purchase from local market' });
  }

  // Draft, pending-approval, approved and cancelled orders.
  const y1 = subDays(now, 1);
  const pendingPo = buildPo({ supplier: suppliers.annapurna, lines: [line('FB-FLOUR-01', 120), line('FB-SUGAR-01', 60)], createdAt: y1, status: S.PENDING_APPROVAL, history: [hist(users.manager, y1, S.DRAFT), hist(users.manager, addMinutes(y1, 10), S.PENDING_APPROVAL)] });
  pendingPo.notes = 'Festival menu requires extra flour and sugar.';
  const draftPo = buildPo({ supplier: suppliers.cleanpro, lines: [line('KS-GLOVE-01', 15), line('CM-DISH-01', 40)], createdAt: now, status: S.DRAFT, history: [hist(users.manager, now, S.DRAFT)] });
  const y2 = subDays(now, 2);
  const approvedPo = buildPo({ supplier: suppliers.himal, lines: [line('TL-HANDW-01', 120)], createdAt: y2, status: S.APPROVED, history: [hist(users.manager, y2, S.DRAFT), hist(users.manager, y2, S.PENDING_APPROVAL), hist(users.admin, addMinutes(y2, 90), S.APPROVED)] });
  Object.assign(approvedPo, { approvedBy: users.admin._id, approvedAt: addMinutes(y2, 90) });
  const y3 = subDays(now, 3);
  const orderedPo = buildPo({
    supplier: suppliers.hardware, lines: [line('OS-A4-01', 20), line('ME-BULB-01', 40)], createdAt: y3, status: S.ORDERED,
    history: [hist(users.manager, y3, S.DRAFT), hist(users.manager, y3, S.PENDING_APPROVAL), hist(users.admin, addMinutes(y3, 45), S.APPROVED), hist(users.manager, addMinutes(y3, 70), S.ORDERED)],
  });
  Object.assign(orderedPo, { approvedBy: users.admin._id, approvedAt: addMinutes(y3, 45), orderedAt: addMinutes(y3, 70), expectedDeliveryDate: addDays(y3, 7) });
  const c60 = subDays(now, 60);
  const cancelledPo = buildPo({ supplier: suppliers.valley, lines: [line('FB-RICE-01', 100)], createdAt: c60, status: S.CANCELLED, history: [hist(users.manager, c60, S.DRAFT), hist(users.manager, c60, S.CANCELLED, 'Supplier suspended after late deliveries')] });
  cancelledPo.cancelledAt = c60;

  // ---------- Reference numbers (chronological, per year) ----------
  const counters = {};
  const nextRef = (prefix, date, pad) => {
    const year = date.getFullYear();
    const k = `${prefix}:${year}`;
    counters[k] = (counters[k] || 0) + 1;
    return `${prefix}-${year}-${String(counters[k]).padStart(pad, '0')}`;
  };
  pos.sort((a, b) => a.createdAt - b.createdAt).forEach((po) => { po.poNumber = nextRef('PO', po.createdAt, 4); });
  const receipts = pos.flatMap((po) => po.receipts.map((r) => ({ po, r }))).sort((a, b) => a.r.receivedAt - b.r.receivedAt);
  const grnByReceipt = new Map();
  for (const { po, r } of receipts) {
    r.receiptNo = nextRef('GRN', r.receivedAt, 4);
    grnByReceipt.set(`GRN:${r._id}`, { receiptNo: r.receiptNo, poNumber: po.poNumber });
    const h = po.statusHistory.find((x) => x.note === 'Goods received' && +x.at === +r.receivedAt);
    if (h) h.note = `${r.receiptNo}: received ${r.lines.length} line(s)`;
  }
  movements.sort((a, b) => a.occurredAt - b.occurredAt);
  for (const mv of movements) {
    const grn = grnByReceipt.get(mv.referenceNo);
    if (grn) {
      mv.referenceNo = grn.receiptNo;
      mv.reason = `Received against ${grn.poNumber}`;
    } else {
      mv.referenceNo = nextRef('MV', mv.occurredAt, 6);
    }
  }

  // ---------- Persist ----------
  const created = subDays(start, 1);
  await InventoryItem.insertMany(
    state.map((st) => {
      const { def } = st;
      return {
        _id: st._id, hotelId, name: def.name, sku: def.sku, category: st.category, description: def.description,
        unit: def.unit, currentStock: st.stock, minStock: def.minStock, maxStock: def.maxStock, reorderPoint: def.reorderPoint,
        unitCost: def.unitCost, supplier: st.supplier._id, location: def.location,
        expiryDate: def.expiryInDays !== undefined ? addDays(today, def.expiryInDays) : null,
        leadTimeDays: def.leadTimeDays ?? null, safetyStock: def.safetyStock ?? null, orderingCost: def.orderingCost ?? null,
        createdBy: users.manager._id, updatedBy: users.manager._id, createdAt: created, updatedAt: now,
      };
    }),
    { timestamps: false }
  );
  await PurchaseOrder.insertMany(pos, { timestamps: false });
  await StockMovement.insertMany(movements, { timestamps: false });
  await ConsumptionRecord.insertMany(consumption, { timestamps: false });
  await Counter.insertMany(Object.entries(counters).map(([k, seq]) => ({ _id: `${hotelId}:${k}`, seq })));

  // ---------- Notifications & audit trail ----------
  await scanHotelAlerts(hotelId);
  await openPoApprovalAlert(await PurchaseOrder.findById(pendingPo._id).lean(), users.manager.name);
  const adj = movements.find((m) => m.type === M.ADJUSTMENT);
  if (adj) await notifySignificantAdjustment(adj, HOTEL.settings);

  const audit = (u, action, entityType, entityId, summary, at) => ({ hotelId, user: u._id, userName: u.name, userRole: u.role, action, entityType, entityId, summary, createdAt: at });
  await AuditLog.insertMany([
    audit(users.admin, 'system.seed', 'Hotel', hotelId, `Demo data generated: ${DAYS} days of history`, now),
    audit(users.manager, 'po.create', 'PurchaseOrder', pendingPo._id, `Created ${pendingPo.poNumber}`, y1),
    audit(users.manager, 'po.submit', 'PurchaseOrder', pendingPo._id, `${pendingPo.poNumber} submitted for approval`, addMinutes(y1, 10)),
    audit(users.admin, 'po.approve', 'PurchaseOrder', approvedPo._id, `${approvedPo.poNumber} approved`, addMinutes(y2, 90)),
    audit(users.manager, 'po.receive', 'PurchaseOrder', linenPo._id, `${linenPo.receipts[0].receiptNo}: received 1 line(s) on ${linenPo.poNumber}`, linenPo.receipts[0].receivedAt),
    audit(users.manager, 'po.cancel', 'PurchaseOrder', cancelledPo._id, `${cancelledPo.poNumber} cancelled`, c60),
    ...(adj ? [audit(users.manager, 'stock.adjustment', 'StockMovement', adj._id, `Adjustment of ${adj.itemName} (${adj.balanceBefore} → ${adj.balanceAfter})`, adj.occurredAt)] : []),
  ]);

  // ---------- Summary ----------
  const statusCount = pos.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {});
  console.log('\n✔ Seed complete');
  console.log(`  Hotel:          ${hotel.name} (${hotel.code})`);
  console.log(`  Categories:     ${categories.length}`);
  console.log(`  Suppliers:      ${Object.keys(suppliers).length}`);
  console.log(`  Items:          ${state.length}`);
  console.log(`  Movements:      ${movements.length}`);
  console.log(`  Consumption:    ${consumption.length} records over ${DAYS} days`);
  console.log(`  Purchase orders ${pos.length}: ${Object.entries(statusCount).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`  Notifications:  ${await Notification.countDocuments({ hotelId })}`);
  console.log('\nDemo accounts:');
  for (const u of USERS) console.log(`  ${u.role.padEnd(18)} ${u.email.padEnd(24)} ${u.password}`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
