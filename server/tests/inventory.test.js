import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { subDays } from 'date-fns';
import { startTestServer, stopTestServer, clearDatabase, createHotelFixture, createCatalogFixture, auth } from './helpers.js';
import { AuditLog, Category, ConsumptionRecord, InventoryItem, Notification, StockMovement } from '../models/index.js';

let app;
let fx;
let cat;

beforeAll(async () => {
  app = await startTestServer();
});
afterAll(stopTestServer);
beforeEach(async () => {
  await clearDatabase();
  fx = await createHotelFixture(app);
  cat = await createCatalogFixture(fx.hotel._id);
});

const move = (token, body) => request(app).post('/api/movements').set(auth(token)).send(body);

describe('Inventory CRUD', () => {
  it('creates an item with opening stock recorded as a Stock In movement', async () => {
    const res = await request(app).post('/api/items').set(auth(fx.tokens.manager)).send({
      name: 'Sugar', sku: 'fb-sugar', category: String(cat.category._id), unit: 'kg',
      unitCost: 95, reorderPoint: 20, maxStock: 150, openingStock: 60, supplier: String(cat.supplier._id),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe('FB-SUGAR');
    expect(res.body.data.currentStock).toBe(60);
    expect(res.body.data.stockStatus).toBe('in_stock');
    const mv = await StockMovement.findOne({ item: res.body.data._id });
    expect(mv).toMatchObject({ type: 'stock_in', quantity: 60, balanceBefore: 0, balanceAfter: 60, reason: 'Opening stock' });
    expect(await AuditLog.countDocuments({ action: 'item.create' })).toBe(1);
  });

  it('validates input and stock level rules', async () => {
    const res = await request(app).post('/api/items').set(auth(fx.tokens.manager)).send({
      name: 'X', sku: 'bad sku!', category: 'nope', unit: 'tonnes', unitCost: -1, minStock: 50, maxStock: 10,
    });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'sku', 'category', 'unit', 'unitCost']));
  });

  it('rejects duplicate SKUs within a hotel', async () => {
    const res = await request(app).post('/api/items').set(auth(fx.tokens.manager)).send({
      name: 'Rice 2', sku: 'FB-RICE', category: String(cat.category._id), unit: 'kg', unitCost: 1,
    });
    expect(res.status).toBe(409);
  });

  it('does not allow editing current stock directly', async () => {
    const res = await request(app).put(`/api/items/${cat.item._id}`).set(auth(fx.tokens.manager)).send({ currentStock: 9999, name: 'Basmati Rice' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Basmati Rice');
    expect(res.body.data.currentStock).toBe(100);
  });

  it('lists with search, status filter, sorting and pagination', async () => {
    await InventoryItem.create([
      { hotelId: fx.hotel._id, name: 'Tea', sku: 'FB-TEA', category: cat.category._id, unit: 'kg', unitCost: 800, currentStock: 2, reorderPoint: 5 },
      { hotelId: fx.hotel._id, name: 'Coffee', sku: 'FB-COF', category: cat.category._id, unit: 'kg', unitCost: 1500, currentStock: 0, reorderPoint: 3 },
    ]);
    const low = await request(app).get('/api/items?status=low_stock').set(auth(fx.tokens.staff));
    expect(low.body.data.map((i) => i.name)).toEqual(['Tea']);
    const out = await request(app).get('/api/items?status=out_of_stock').set(auth(fx.tokens.staff));
    expect(out.body.data.map((i) => i.name)).toEqual(['Coffee']);
    const search = await request(app).get('/api/items?search=cof').set(auth(fx.tokens.staff));
    expect(search.body.data).toHaveLength(1);
    const page = await request(app).get('/api/items?sort=unitCost&order=desc&limit=2&page=1').set(auth(fx.tokens.staff));
    expect(page.body.data.map((i) => i.name)).toEqual(['Coffee', 'Tea']);
    expect(page.body.meta).toMatchObject({ total: 3, pages: 2 });
  });

  it('archives on delete and blocks deletion while on an open PO', async () => {
    const po = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager))
      .send({ supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 10 }] });
    expect(po.status).toBe(201);
    expect((await request(app).delete(`/api/items/${cat.item._id}`).set(auth(fx.tokens.manager))).status).toBe(409);
    await request(app).post(`/api/purchase-orders/${po.body.data._id}/cancel`).set(auth(fx.tokens.manager)).send({});
    const del = await request(app).delete(`/api/items/${cat.item._id}`).set(auth(fx.tokens.manager));
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/items/${cat.item._id}`).set(auth(fx.tokens.manager))).status).toBe(404);
    expect(await InventoryItem.countDocuments({ _id: cat.item._id, isArchived: true })).toBe(1);
  });
});

describe('Stock movements', () => {
  it('stock out decreases stock and creates movement + consumption records', async () => {
    const res = await move(fx.tokens.staff, { itemId: String(cat.item._id), type: 'stock_out', quantity: 12.5, department: 'Kitchen' });
    expect(res.status).toBe(201);
    expect(res.body.data.item.currentStock).toBe(87.5);
    expect(res.body.data.movement).toMatchObject({ change: -12.5, balanceBefore: 100, balanceAfter: 87.5 });
    expect(res.body.data.movement.referenceNo).toMatch(/^MV-\d{4}-\d{6}$/);
    expect(await ConsumptionRecord.countDocuments({ item: cat.item._id })).toBe(1);
  });

  it('prevents negative stock', async () => {
    const res = await move(fx.tokens.manager, { itemId: String(cat.item._id), type: 'stock_out', quantity: 100.01 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot go negative/);
    expect((await InventoryItem.findById(cat.item._id)).currentStock).toBe(100);
    expect(await StockMovement.countDocuments()).toBe(0);
  });

  it('prevents overselling under concurrent requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => move(fx.tokens.manager, { itemId: String(cat.item._id), type: 'stock_out', quantity: 30 }))
    );
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    expect((await InventoryItem.findById(cat.item._id)).currentStock).toBe(10);
    expect(await StockMovement.countDocuments()).toBe(3);
  });

  it('handles adjustments, returns, wastage and transfers', async () => {
    const id = String(cat.item._id);
    expect((await move(fx.tokens.manager, { itemId: id, type: 'adjustment', quantity: 5, direction: 'decrease', reason: 'Count' })).body.data.item.currentStock).toBe(95);
    expect((await move(fx.tokens.manager, { itemId: id, type: 'return', quantity: 3, direction: 'increase', reason: 'Unused from banquet' })).body.data.item.currentStock).toBe(98);
    expect((await move(fx.tokens.manager, { itemId: id, type: 'wastage', quantity: 8, reason: 'Spoiled' })).body.data.item.currentStock).toBe(90);
    const partial = await move(fx.tokens.manager, { itemId: id, type: 'transfer', quantity: 10, toLocation: 'Kitchen Store' });
    expect(partial.body.data.item.location).toBe('Main Store');
    const full = await move(fx.tokens.manager, { itemId: id, type: 'transfer', quantity: 90, toLocation: 'Kitchen Store' });
    expect(full.body.data.item).toMatchObject({ location: 'Kitchen Store', currentStock: 90 });
    // Wastage is not consumption, so it does not inflate the demand forecast.
    expect(await ConsumptionRecord.countDocuments()).toBe(0);
    expect(await StockMovement.countDocuments({ item: id })).toBe(5);
  });

  it('requires reason/direction where needed', async () => {
    const res = await move(fx.tokens.manager, { itemId: String(cat.item._id), type: 'adjustment', quantity: 5 });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(expect.arrayContaining(['direction', 'reason']));
  });

  it('restricts staff to consumption only', async () => {
    const res = await move(fx.tokens.staff, { itemId: String(cat.item._id), type: 'stock_in', quantity: 5 });
    expect(res.status).toBe(403);
  });

  it('opens a low stock alert once and resolves it when restocked', async () => {
    const id = String(cat.item._id);
    await move(fx.tokens.staff, { itemId: id, type: 'stock_out', quantity: 65 }); // 35 <= ROP 40
    await move(fx.tokens.staff, { itemId: id, type: 'stock_out', quantity: 5 }); // still low: no duplicate
    expect(await Notification.countDocuments({ type: 'low_stock', active: true })).toBe(1);
    await move(fx.tokens.staff, { itemId: id, type: 'stock_out', quantity: 30 }); // 0: out of stock
    expect(await Notification.countDocuments({ type: 'low_stock', active: true })).toBe(0);
    expect(await Notification.countDocuments({ type: 'out_of_stock', active: true })).toBe(1);
    await move(fx.tokens.manager, { itemId: id, type: 'stock_in', quantity: 100 });
    expect(await Notification.countDocuments({ active: true, item: id })).toBe(0);
  });

  it('notifies managers about significant adjustments', async () => {
    await move(fx.tokens.manager, { itemId: String(cat.item._id), type: 'adjustment', quantity: 50, direction: 'decrease', reason: 'Stock count' });
    const n = await Notification.findOne({ type: 'stock_adjustment' });
    expect(n.roles).toEqual(['admin', 'inventory_manager']);
    const staffList = await request(app).get('/api/notifications').set(auth(fx.tokens.staff));
    expect(staffList.body.data.find((x) => x.type === 'stock_adjustment')).toBeUndefined();
  });
});

describe('Expiry alerts', () => {
  it('creates expiring and expired alerts through the scan', async () => {
    await InventoryItem.updateOne({ _id: cat.item._id }, { expiryDate: subDays(new Date(), 1) });
    const other = await InventoryItem.create({ hotelId: fx.hotel._id, name: 'Milk', sku: 'FB-MILK', category: cat.category._id, unit: 'litre', unitCost: 90, currentStock: 10, expiryDate: new Date(Date.now() + 3 * 86400000) });
    const res = await request(app).post('/api/notifications/scan').set(auth(fx.tokens.manager));
    expect(res.status).toBe(200);
    expect(await Notification.countDocuments({ type: 'expired', item: cat.item._id, active: true })).toBe(1);
    expect(await Notification.countDocuments({ type: 'expiring_critical', item: other._id, active: true })).toBe(1);
  });
});

describe('Notifications', () => {
  it('tracks read/unread per user', async () => {
    await move(fx.tokens.staff, { itemId: String(cat.item._id), type: 'stock_out', quantity: 70 });
    const count = await request(app).get('/api/notifications/unread-count').set(auth(fx.tokens.staff));
    expect(count.body.data.unread).toBe(1);
    const list = await request(app).get('/api/notifications').set(auth(fx.tokens.staff));
    await request(app).patch(`/api/notifications/${list.body.data[0]._id}/read`).set(auth(fx.tokens.staff));
    expect((await request(app).get('/api/notifications/unread-count').set(auth(fx.tokens.staff))).body.data.unread).toBe(0);
    expect((await request(app).get('/api/notifications/unread-count').set(auth(fx.tokens.manager))).body.data.unread).toBe(1);
  });
});

describe('Categories', () => {
  it('blocks deleting a category that has items', async () => {
    const res = await request(app).delete(`/api/categories/${cat.category._id}`).set(auth(fx.tokens.admin));
    expect(res.status).toBe(409);
    const empty = await Category.create({ hotelId: fx.hotel._id, name: 'Office Supplies' });
    expect((await request(app).delete(`/api/categories/${empty._id}`).set(auth(fx.tokens.admin))).status).toBe(200);
  });
});
