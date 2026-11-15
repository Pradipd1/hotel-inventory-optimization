import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { subDays } from 'date-fns';
import { startTestServer, stopTestServer, clearDatabase, createHotelFixture, createCatalogFixture, auth } from './helpers.js';
import { ConsumptionRecord, InventoryItem, Notification, StockMovement, Supplier } from '../models/index.js';

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

async function orderedPo(quantity = 50) {
  const created = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager)).send({
    supplier: String(cat.supplier._id),
    items: [{ item: String(cat.item._id), quantity, unitPrice: 110 }],
    taxRate: 13,
  });
  const id = created.body.data._id;
  await request(app).post(`/api/purchase-orders/${id}/submit`).set(auth(fx.tokens.manager)).send({});
  await request(app).post(`/api/purchase-orders/${id}/approve`).set(auth(fx.tokens.admin)).send({});
  await request(app).post(`/api/purchase-orders/${id}/order`).set(auth(fx.tokens.manager)).send({});
  return (await request(app).get(`/api/purchase-orders/${id}`).set(auth(fx.tokens.manager))).body.data;
}

describe('Purchase order workflow', () => {
  it('calculates totals on the server', async () => {
    const res = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager)).send({
      supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 10, unitPrice: 115.5 }], taxRate: 13,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'draft', subtotal: 1155, taxAmount: 150.15, total: 1305.15 });
    expect(res.body.data.poNumber).toMatch(/^PO-\d{4}-0001$/);
  });

  it('follows draft → pending → approved → ordered, with admin-only approval', async () => {
    const created = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager))
      .send({ supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 10 }] });
    const id = created.body.data._id;
    expect((await request(app).post(`/api/purchase-orders/${id}/approve`).set(auth(fx.tokens.admin)).send({})).status).toBe(409); // still draft
    expect((await request(app).post(`/api/purchase-orders/${id}/submit`).set(auth(fx.tokens.manager)).send({})).body.data.status).toBe('pending_approval');
    expect(await Notification.countDocuments({ type: 'po_pending_approval', active: true })).toBe(1);
    expect((await request(app).post(`/api/purchase-orders/${id}/approve`).set(auth(fx.tokens.manager)).send({})).status).toBe(403);
    expect((await request(app).post(`/api/purchase-orders/${id}/order`).set(auth(fx.tokens.manager)).send({})).status).toBe(409); // not approved yet
    expect((await request(app).post(`/api/purchase-orders/${id}/approve`).set(auth(fx.tokens.admin)).send({})).body.data.status).toBe('approved');
    expect(await Notification.countDocuments({ type: 'po_pending_approval', active: true })).toBe(0);
    expect((await request(app).put(`/api/purchase-orders/${id}`).set(auth(fx.tokens.manager)).send({ notes: 'x' })).status).toBe(409); // only drafts editable
    expect((await request(app).post(`/api/purchase-orders/${id}/order`).set(auth(fx.tokens.manager)).send({})).body.data.status).toBe('ordered');
  });

  it('rejects back to draft', async () => {
    const created = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager))
      .send({ supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 10 }] });
    const id = created.body.data._id;
    await request(app).post(`/api/purchase-orders/${id}/submit`).set(auth(fx.tokens.manager)).send({});
    const rej = await request(app).post(`/api/purchase-orders/${id}/reject`).set(auth(fx.tokens.admin)).send({ note: 'Quantity too high' });
    expect(rej.body.data.status).toBe('draft');
  });

  it('receives partially then fully, adding stock and movements', async () => {
    const po = await orderedPo(50);
    const line = po.items[0];
    const r1 = await request(app).post(`/api/purchase-orders/${po._id}/receive`).set(auth(fx.tokens.manager))
      .send({ idempotencyKey: 'delivery-0001', lines: [{ lineId: line._id, quantity: 20 }] });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('partially_received');
    expect((await InventoryItem.findById(cat.item._id)).currentStock).toBe(120);

    const over = await request(app).post(`/api/purchase-orders/${po._id}/receive`).set(auth(fx.tokens.manager))
      .send({ idempotencyKey: 'delivery-0002', lines: [{ lineId: line._id, quantity: 31 }] });
    expect(over.status).toBe(400);

    const r2 = await request(app).post(`/api/purchase-orders/${po._id}/receive`).set(auth(fx.tokens.manager))
      .send({ idempotencyKey: 'delivery-0003', lines: [{ lineId: line._id, quantity: 30 }] });
    expect(r2.body.data.status).toBe('received');
    expect((await InventoryItem.findById(cat.item._id)).currentStock).toBe(150);
    const moves = await StockMovement.find({ purchaseOrder: po._id });
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.type === 'stock_in' && m.unitCost === 110)).toBe(true);
  });

  it('prevents duplicate stock addition (resubmission and concurrent receives)', async () => {
    const po = await orderedPo(50);
    const body = { idempotencyKey: 'same-key-123', lines: [{ lineId: po.items[0]._id, quantity: 50 }] };
    const first = await request(app).post(`/api/purchase-orders/${po._id}/receive`).set(auth(fx.tokens.manager)).send(body);
    expect(first.status).toBe(200);
    const again = await request(app).post(`/api/purchase-orders/${po._id}/receive`).set(auth(fx.tokens.manager)).send(body);
    expect(again.status).toBe(409);
    expect((await InventoryItem.findById(cat.item._id)).currentStock).toBe(150);

    const po2 = await orderedPo(40);
    const results = await Promise.all(
      ['k-aaaaaaaa', 'k-bbbbbbbb', 'k-cccccccc'].map((k) =>
        request(app).post(`/api/purchase-orders/${po2._id}/receive`).set(auth(fx.tokens.manager)).send({ idempotencyKey: k, lines: [{ lineId: po2.items[0]._id, quantity: 40 }] })
      )
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await InventoryItem.findById(cat.item._id)).currentStock).toBe(190);
    expect(await StockMovement.countDocuments({ purchaseOrder: po2._id })).toBe(1);
  });

  it('cannot receive before ordering or cancel after receiving', async () => {
    const created = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager))
      .send({ supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 10 }] });
    const early = await request(app).post(`/api/purchase-orders/${created.body.data._id}/receive`).set(auth(fx.tokens.manager))
      .send({ idempotencyKey: 'early-key-1', lines: [{ lineId: created.body.data.items[0]._id, quantity: 5 }] });
    expect(early.status).toBe(409);

    const po = await orderedPo(10);
    await request(app).post(`/api/purchase-orders/${po._id}/receive`).set(auth(fx.tokens.manager)).send({ idempotencyKey: 'part-key-1', lines: [{ lineId: po.items[0]._id, quantity: 5 }] });
    expect((await request(app).post(`/api/purchase-orders/${po._id}/cancel`).set(auth(fx.tokens.manager)).send({})).status).toBe(409);
  });

  it('blocks inactive suppliers', async () => {
    await Supplier.updateOne({ _id: cat.supplier._id }, { status: 'inactive' });
    const res = await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager))
      .send({ supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 10 }] });
    expect(res.status).toBe(400);
  });
});

describe('Suppliers', () => {
  it('shows purchase history and blocks deletion while referenced', async () => {
    await orderedPo(10);
    const detail = await request(app).get(`/api/suppliers/${cat.supplier._id}`).set(auth(fx.tokens.manager));
    expect(detail.body.data.products).toHaveLength(1);
    expect(detail.body.data.purchaseHistory).toHaveLength(1);
    expect((await request(app).delete(`/api/suppliers/${cat.supplier._id}`).set(auth(fx.tokens.manager))).status).toBe(409);
    const fresh = await request(app).post('/api/suppliers').set(auth(fx.tokens.manager)).send({ name: 'Unused Supplies', email: 'a@b.com', phone: '+977 1-4400000' });
    expect(fresh.status).toBe(201);
    expect((await request(app).delete(`/api/suppliers/${fresh.body.data._id}`).set(auth(fx.tokens.manager))).status).toBe(200);
  });
});

describe('Optimization engine', () => {
  async function seedConsumption(daily, days = 30) {
    const records = [];
    for (let d = 1; d <= days; d++) {
      records.push({ hotelId: fx.hotel._id, item: cat.item._id, quantity: daily + (d % 2 ? 1 : -1), unitCost: 120, date: subDays(new Date(), d) });
    }
    await ConsumptionRecord.insertMany(records);
  }

  it('produces a reorder recommendation from real consumption and parameters', async () => {
    await seedConsumption(10); // avg 10/day
    await InventoryItem.updateOne({ _id: cat.item._id }, { currentStock: 45, safetyStock: 10 }); // ROP = 10*5 + 10 = 60
    const res = await request(app).get('/api/optimization/recommendations').set(auth(fx.tokens.manager));
    expect(res.status).toBe(200);
    const rec = res.body.data.reorder.find((r) => r.item.sku === 'FB-RICE');
    expect(rec.avgDailyDemand).toBe(10);
    expect(rec.reorderPoint).toBe(60);
    expect(rec.reorderPointSource).toBe('calculated');
    // EOQ = sqrt(2 * 3650 * 500 / (120 * 20%)) = 390.0 -> capped at max 300 - 45 = 255
    expect(rec.eoq).toBeCloseTo(Math.sqrt((2 * 3650 * 500) / 24), 1);
    expect(rec.suggestedQuantity).toBe(255);
    expect(rec.estimatedCost).toBe(255 * 120);
    expect(rec.priority).toBe('critical'); // 4.5 days of cover < 5-day lead time
    expect(rec.reason).toMatch(/Consider ordering 255 kg/);
  });

  it('reports EOQ as not calculable when cost parameters are missing', async () => {
    await seedConsumption(10);
    const { Hotel } = await import('../models/index.js');
    await Hotel.updateOne({ _id: fx.hotel._id }, { 'settings.defaultOrderingCost': null, 'settings.holdingCostRate': null });
    const res = await request(app).get(`/api/optimization/items/${cat.item._id}`).set(auth(fx.tokens.manager));
    expect(res.body.data.eoq.canCalculate).toBe(false);
    expect(res.body.data.eoq.missing).toHaveLength(2);
    expect(res.body.data.history.length).toBeGreaterThan(20);
    expect(res.body.data.forecast.dataQuality.level).toBe('high');
  });

  it('flags insufficient history instead of guessing', async () => {
    const res = await request(app).get(`/api/optimization/items/${cat.item._id}`).set(auth(fx.tokens.manager));
    expect(res.body.data.forecast.dataQuality.level).toBe('insufficient');
    expect(res.body.data.calculatedReorderPoint.canCalculate).toBe(false);
    expect(res.body.data.reorderPointSource).toBe('configured');
  });

  it('applies the calculated reorder point and creates draft POs only on request', async () => {
    await seedConsumption(10);
    const apply = await request(app).post(`/api/optimization/items/${cat.item._id}/apply-reorder-point`).set(auth(fx.tokens.manager));
    expect(apply.status).toBe(200);
    expect((await InventoryItem.findById(cat.item._id)).reorderPoint).toBe(50);

    const create = await request(app).post('/api/optimization/purchase-orders').set(auth(fx.tokens.manager))
      .send({ items: [{ item: String(cat.item._id), quantity: 120 }] });
    expect(create.status).toBe(201);
    expect(create.body.data).toHaveLength(1);
    const po = await request(app).get(`/api/purchase-orders/${create.body.data[0]._id}`).set(auth(fx.tokens.manager));
    expect(po.body.data).toMatchObject({ status: 'draft', source: 'optimization' });
  });

  it('counts stock already on order (inventory position) to avoid double ordering', async () => {
    await seedConsumption(10);
    await InventoryItem.updateOne({ _id: cat.item._id }, { currentStock: 45, safetyStock: 10 }); // ROP 60
    await orderedPo(100); // approved + ordered: 100 kg on the way -> position 145
    const res = await request(app).get('/api/optimization/recommendations').set(auth(fx.tokens.manager));
    expect(res.body.data.reorder.find((r) => r.item.sku === 'FB-RICE')).toBeUndefined();

    await InventoryItem.updateOne({ _id: cat.item._id }, { currentStock: 0 }); // position 100 > 60*1.2
    const again = await request(app).get('/api/optimization/recommendations').set(auth(fx.tokens.manager));
    expect(again.body.data.reorder.find((r) => r.item.sku === 'FB-RICE')).toBeUndefined();

    await request(app).post('/api/purchase-orders').set(auth(fx.tokens.manager))
      .send({ supplier: String(cat.supplier._id), items: [{ item: String(cat.item._id), quantity: 5 }] }); // draft only
    await InventoryItem.updateOne({ _id: cat.item._id }, { currentStock: 0 });
    const { PurchaseOrder } = await import('../models/index.js');
    await PurchaseOrder.updateMany({ status: 'ordered' }, { status: 'cancelled' });
    const third = await request(app).get('/api/optimization/recommendations').set(auth(fx.tokens.manager));
    const rec = third.body.data.reorder.find((r) => r.item.sku === 'FB-RICE');
    expect(rec.priority).toBe('critical');
    expect(rec.pendingOrderQuantity).toBe(5);
    expect(rec.reason).toMatch(/draft\/pending order PO-/);
  });

  it('detects overstock and expiry risk', async () => {
    await seedConsumption(2);
    await InventoryItem.updateOne({ _id: cat.item._id }, { currentStock: 400, expiryDate: new Date(Date.now() + 10 * 86400000) });
    const res = await request(app).get('/api/optimization/recommendations').set(auth(fx.tokens.manager));
    expect(res.body.data.overstock[0]).toMatchObject({ excessQuantity: 100, excessValue: 12000 });
    const exp = res.body.data.expiry[0];
    expect(exp.atRiskQuantity).toBeCloseTo(400 - 2 * exp.daysToExpiry, 0);
  });
});

describe('Reports and dashboard', () => {
  it('builds the dashboard from database values', async () => {
    await request(app).post('/api/movements').set(auth(fx.tokens.staff)).send({ itemId: String(cat.item._id), type: 'stock_out', quantity: 10 });
    const res = await request(app).get('/api/dashboard').set(auth(fx.tokens.staff));
    expect(res.status).toBe(200);
    expect(res.body.data.kpis).toMatchObject({ totalItems: 1, totalCategories: 1, totalStockValue: 90 * 120, monthlyConsumptionValue: 1200 });
    expect(res.body.data.charts.monthlyConsumption).toHaveLength(6);
    expect(res.body.data.recentMovements).toHaveLength(1);
  });

  it('runs every report and exports CSV and PDF', async () => {
    await request(app).post('/api/movements').set(auth(fx.tokens.manager)).send({ itemId: String(cat.item._id), type: 'wastage', quantity: 4, reason: '=cmd spoiled' });
    const list = await request(app).get('/api/reports').set(auth(fx.tokens.manager));
    expect(list.body.data).toHaveLength(10);
    for (const r of list.body.data) {
      const res = await request(app).get(`/api/reports/${r.key}`).set(auth(fx.tokens.manager));
      expect(res.status, r.key).toBe(200);
      expect(Array.isArray(res.body.data.rows)).toBe(true);
    }
    const wastage = await request(app).get('/api/reports/wastage').set(auth(fx.tokens.manager));
    expect(wastage.body.data.summary[1].value).toBe(480);

    const csv = await request(app).get('/api/reports/movements?format=csv').set(auth(fx.tokens.manager));
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain("'=cmd spoiled"); // formula-injection guard
    const pdf = await request(app).get('/api/reports/inventory?format=pdf').set(auth(fx.tokens.manager)).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('filters reports by date range and category', async () => {
    const res = await request(app).get(`/api/reports/inventory?category=${cat.category._id}`).set(auth(fx.tokens.manager));
    expect(res.body.data.rows).toHaveLength(1);
    const bad = await request(app).get('/api/reports/movements?from=2026-05-01&to=2026-01-01').set(auth(fx.tokens.manager));
    expect(bad.status).toBe(400);
  });
});
