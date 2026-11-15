import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDB, disconnectDB } from '../config/db.js';
import { createApp } from '../app.js';
import { Hotel, User, Category, Supplier, InventoryItem } from '../models/index.js';

let replSet;

/** Starts an isolated in-memory replica set (so transactions are exercised) and returns the app. */
export async function startTestServer() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDB(replSet.getUri('hotel_inventory_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return createApp();
}

export async function stopTestServer() {
  await disconnectDB();
  await replSet?.stop();
}

export async function clearDatabase() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export const PASSWORDS = { admin: 'Admin@123', manager: 'Manager@123', staff: 'Staff@123' };

/** Creates a hotel with admin, manager and staff users and returns their auth tokens. */
export async function createHotelFixture(app, code = 'TEST') {
  const hotel = await Hotel.create({
    name: `${code} Hotel`,
    code,
    settings: { defaultOrderingCost: 500, holdingCostRate: 20 },
  });
  const lc = code.toLowerCase();
  const users = {
    admin: await User.create({ hotelId: hotel._id, name: 'Admin', email: `admin@${lc}.com`, password: PASSWORDS.admin, role: 'admin' }),
    manager: await User.create({ hotelId: hotel._id, name: 'Manager', email: `manager@${lc}.com`, password: PASSWORDS.manager, role: 'inventory_manager' }),
    staff: await User.create({ hotelId: hotel._id, name: 'Staff', email: `staff@${lc}.com`, password: PASSWORDS.staff, role: 'staff' }),
  };
  const tokens = {};
  for (const role of Object.keys(users)) {
    const res = await request(app).post('/api/auth/login').send({ email: users[role].email, password: PASSWORDS[role] });
    tokens[role] = res.body.token;
  }
  return { hotel, users, tokens };
}

/** Creates a category, a supplier and one inventory item directly in the database. */
export async function createCatalogFixture(hotelId, overrides = {}) {
  const category = await Category.create({ hotelId, name: 'Food and Beverages' });
  const supplier = await Supplier.create({ hotelId, name: 'Fresh Foods Ltd', leadTimeDays: 5 });
  const item = await InventoryItem.create({
    hotelId,
    name: 'Rice',
    sku: 'FB-RICE',
    category: category._id,
    unit: 'kg',
    currentStock: 100,
    minStock: 20,
    maxStock: 300,
    reorderPoint: 40,
    unitCost: 120,
    supplier: supplier._id,
    ...overrides,
  });
  return { category, supplier, item };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });
