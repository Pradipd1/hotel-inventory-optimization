import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { imageUpload } from '../middleware/upload.js';
import { ROLES } from '../utils/constants.js';
import { idParams } from '../validators/common.js';
import { categorySchema, createItemSchema, createMovementSchema, itemListQuery, movementListQuery, updateItemSchema } from '../validators/inventoryValidators.js';
import { fromRecommendationsSchema, poListQuery, poNoteSchema, purchaseOrderSchema, receiveSchema, supplierListQuery, supplierSchema, supplierUpdateSchema } from '../validators/supplierValidators.js';
import { auditListQuery, createUserSchema, notificationListQuery, resetPasswordSchema, settingsSchema, updateUserSchema, userListQuery } from '../validators/adminValidators.js';
import authRoutes from './authRoutes.js';
import * as categories from '../controllers/categoryController.js';
import * as items from '../controllers/inventoryController.js';
import * as movements from '../controllers/movementController.js';
import * as suppliers from '../controllers/supplierController.js';
import * as orders from '../controllers/purchaseOrderController.js';
import * as analytics from '../controllers/analyticsController.js';
import * as admin from '../controllers/adminController.js';

const { ADMIN, MANAGER, STAFF } = ROLES;
const anyRole = authorize(ADMIN, MANAGER, STAFF);
const management = authorize(ADMIN, MANAGER);
const adminOnly = authorize(ADMIN);
const byId = validate({ params: idParams });

const router = Router();
router.use('/auth', authRoutes);
router.use(authenticate);

// Dashboard
router.get('/dashboard', anyRole, analytics.dashboard);

// Categories: everyone reads, management creates/edits, admin deletes
router.get('/categories', anyRole, categories.list);
router.post('/categories', management, validate({ body: categorySchema }), categories.create);
router.put('/categories/:id', management, validate({ params: idParams, body: categorySchema.partial() }), categories.update);
router.delete('/categories/:id', adminOnly, byId, categories.remove);

// Inventory items
router.get('/items', anyRole, validate({ query: itemListQuery }), items.list);
router.get('/items/:id', anyRole, byId, items.get);
router.get('/items/:id/movements', anyRole, byId, items.history);
router.post('/items', management, validate({ body: createItemSchema }), items.create);
router.put('/items/:id', management, validate({ params: idParams, body: updateItemSchema }), items.update);
router.delete('/items/:id', management, byId, items.remove);
router.post('/items/:id/image', management, byId, imageUpload, items.uploadImage);

// Stock movements (staff: stock out only, enforced in the controller)
router.get('/movements', anyRole, validate({ query: movementListQuery }), movements.list);
router.post('/movements', anyRole, validate({ body: createMovementSchema }), movements.create);

// Suppliers
router.get('/suppliers', management, validate({ query: supplierListQuery }), suppliers.list);
router.get('/suppliers/:id', management, byId, suppliers.get);
router.post('/suppliers', management, validate({ body: supplierSchema }), suppliers.create);
router.put('/suppliers/:id', management, validate({ params: idParams, body: supplierUpdateSchema }), suppliers.update);
router.delete('/suppliers/:id', management, byId, suppliers.remove);

// Purchase orders (approve/reject restricted to admin inside the workflow rules too)
router.get('/purchase-orders', management, validate({ query: poListQuery }), orders.list);
router.get('/purchase-orders/:id', management, byId, orders.get);
router.post('/purchase-orders', management, validate({ body: purchaseOrderSchema }), orders.create);
router.put('/purchase-orders/:id', management, validate({ params: idParams, body: purchaseOrderSchema.partial() }), orders.update);
router.post('/purchase-orders/:id/submit', management, validate({ params: idParams, body: poNoteSchema }), orders.transition('submit'));
router.post('/purchase-orders/:id/approve', adminOnly, validate({ params: idParams, body: poNoteSchema }), orders.transition('approve'));
router.post('/purchase-orders/:id/reject', adminOnly, validate({ params: idParams, body: poNoteSchema }), orders.transition('reject'));
router.post('/purchase-orders/:id/order', management, validate({ params: idParams, body: poNoteSchema }), orders.transition('order'));
router.post('/purchase-orders/:id/cancel', management, validate({ params: idParams, body: poNoteSchema }), orders.transition('cancel'));
router.post('/purchase-orders/:id/receive', management, validate({ params: idParams, body: receiveSchema }), orders.receive);

// Optimization engine
router.get('/optimization/recommendations', management, analytics.recommendations);
router.get('/optimization/items/:id', management, byId, analytics.itemForecast);
router.post('/optimization/items/:id/apply-reorder-point', management, byId, analytics.applyReorderPoint);
router.post('/optimization/purchase-orders', management, validate({ body: fromRecommendationsSchema }), analytics.createOrders);

// Reports
router.get('/reports', management, analytics.listReports);
router.get('/reports/:key', management, validate({ query: analytics.reportQuery }), analytics.report);

// Notifications
router.get('/notifications', anyRole, validate({ query: notificationListQuery }), admin.listNotifications);
router.get('/notifications/unread-count', anyRole, admin.unreadCount);
router.patch('/notifications/read-all', anyRole, admin.markAllRead);
router.patch('/notifications/:id/read', anyRole, byId, admin.markRead);
router.patch('/notifications/:id/unread', anyRole, byId, admin.markUnread);
router.post('/notifications/scan', management, admin.scanAlerts);

// Administration
router.get('/users', adminOnly, validate({ query: userListQuery }), admin.listUsers);
router.post('/users', adminOnly, validate({ body: createUserSchema }), admin.createUser);
router.put('/users/:id', adminOnly, validate({ params: idParams, body: updateUserSchema }), admin.updateUser);
router.put('/users/:id/password', adminOnly, validate({ params: idParams, body: resetPasswordSchema }), admin.resetUserPassword);
router.delete('/users/:id', adminOnly, byId, admin.deleteUser);
router.get('/settings', anyRole, admin.getSettings);
router.put('/settings', adminOnly, validate({ body: settingsSchema }), admin.updateSettings);
router.get('/audit-logs', adminOnly, validate({ query: auditListQuery }), admin.listAuditLogs);

export default router;
