import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestServer, stopTestServer, clearDatabase, createHotelFixture, createCatalogFixture, auth } from './helpers.js';
import { Category, InventoryItem } from '../models/index.js';

let app;
let a; // hotel A
let b; // hotel B
let catA;
let catB;

beforeAll(async () => {
  app = await startTestServer();
});
afterAll(stopTestServer);
beforeEach(async () => {
  await clearDatabase();
  a = await createHotelFixture(app, 'HOTA');
  b = await createHotelFixture(app, 'HOTB');
  catA = await createCatalogFixture(a.hotel._id);
  catB = await createCatalogFixture(b.hotel._id, { name: 'Rice B' });
});

describe('Role-based access control', () => {
  const cases = [
    ['get', '/api/users', { admin: 200, manager: 403, staff: 403 }],
    ['get', '/api/audit-logs', { admin: 200, manager: 403, staff: 403 }],
    ['get', '/api/suppliers', { admin: 200, manager: 200, staff: 403 }],
    ['get', '/api/purchase-orders', { admin: 200, manager: 200, staff: 403 }],
    ['get', '/api/optimization/recommendations', { admin: 200, manager: 200, staff: 403 }],
    ['get', '/api/reports', { admin: 200, manager: 200, staff: 403 }],
    ['get', '/api/items', { admin: 200, manager: 200, staff: 200 }],
    ['get', '/api/dashboard', { admin: 200, manager: 200, staff: 200 }],
  ];
  it.each(cases)('%s %s', async (method, url, expected) => {
    for (const [role, status] of Object.entries(expected)) {
      const res = await request(app)[method](url).set(auth(a.tokens[role]));
      expect(res.status, `${role} ${url}`).toBe(status);
    }
  });

  it('only admins manage settings and users', async () => {
    expect((await request(app).put('/api/settings').set(auth(a.tokens.manager)).send({ settings: { currency: 'USD' } })).status).toBe(403);
    expect((await request(app).put('/api/settings').set(auth(a.tokens.admin)).send({ settings: { currency: 'USD' } })).status).toBe(200);
    const created = await request(app).post('/api/users').set(auth(a.tokens.admin)).send({ name: 'New Staff', email: 'new@hota.com', password: 'Welcome123', role: 'staff' });
    expect(created.status).toBe(201);
    expect(created.body.data.password).toBeUndefined();
  });

  it('staff cannot create or delete items', async () => {
    expect((await request(app).post('/api/items').set(auth(a.tokens.staff)).send({})).status).toBe(403);
    expect((await request(app).delete(`/api/items/${catA.item._id}`).set(auth(a.tokens.staff))).status).toBe(403);
  });

  it('staff with assigned categories only see that inventory', async () => {
    const other = await Category.create({ hotelId: a.hotel._id, name: 'Toiletries' });
    await InventoryItem.create({ hotelId: a.hotel._id, name: 'Shampoo', sku: 'TL-SH', category: other._id, unit: 'bottle', unitCost: 50, currentStock: 10 });
    await request(app).put(`/api/users/${a.users.staff._id}`).set(auth(a.tokens.admin)).send({ assignedCategories: [String(other._id)] });
    const res = await request(app).get('/api/items').set(auth(a.tokens.staff));
    expect(res.body.data.map((i) => i.name)).toEqual(['Shampoo']);
    expect((await request(app).get(`/api/items/${catA.item._id}`).set(auth(a.tokens.staff))).status).toBe(403);
    const moveRes = await request(app).post('/api/movements').set(auth(a.tokens.staff)).send({ itemId: String(catA.item._id), type: 'stock_out', quantity: 1 });
    expect(moveRes.status).toBe(403);
  });
});

describe('Tenant isolation (hotelId scoping)', () => {
  it('never returns another hotel\'s records', async () => {
    const list = await request(app).get('/api/items').set(auth(a.tokens.admin));
    expect(list.body.data.map((i) => i.name)).toEqual(['Rice']);
    expect((await request(app).get(`/api/items/${catB.item._id}`).set(auth(a.tokens.admin))).status).toBe(404);
    expect((await request(app).get(`/api/suppliers/${catB.supplier._id}`).set(auth(a.tokens.admin))).status).toBe(404);
  });

  it('cannot modify or move stock of another hotel\'s item', async () => {
    expect((await request(app).put(`/api/items/${catB.item._id}`).set(auth(a.tokens.admin)).send({ name: 'Hacked' })).status).toBe(404);
    expect((await request(app).post('/api/movements').set(auth(a.tokens.admin)).send({ itemId: String(catB.item._id), type: 'stock_out', quantity: 1 })).status).toBe(404);
    expect((await InventoryItem.findById(catB.item._id)).currentStock).toBe(100);
  });

  it('cannot reference another hotel\'s category or supplier', async () => {
    const res = await request(app).post('/api/items').set(auth(a.tokens.admin)).send({
      name: 'Cross', sku: 'X-1', category: String(catB.category._id), unit: 'kg', unitCost: 10,
    });
    expect(res.status).toBe(400);
    const po = await request(app).post('/api/purchase-orders').set(auth(a.tokens.admin)).send({
      supplier: String(catB.supplier._id), items: [{ item: String(catA.item._id), quantity: 1 }],
    });
    expect(po.status).toBe(400);
  });

  it('dashboard and reports only include own data', async () => {
    const dash = await request(app).get('/api/dashboard').set(auth(b.tokens.admin));
    expect(dash.body.data.kpis.totalItems).toBe(1);
    const rep = await request(app).get('/api/reports/inventory').set(auth(b.tokens.admin));
    expect(rep.body.data.rows.map((r) => r.name)).toEqual(['Rice B']);
  });
});
