import { api } from './api.js';

const data = (p) => p.then((r) => r.data);

/** Removes empty values so they are not sent as query parameters. */
export const clean = (params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));

export const authApi = {
  login: (body) => data(api.post('/auth/login', body)),
  me: () => data(api.get('/auth/me')),
  logout: () => data(api.post('/auth/logout')),
  changePassword: (body) => data(api.put('/auth/password', body)),
};

export const dashboardApi = {
  get: () => data(api.get('/dashboard')),
};

export const categoriesApi = {
  list: () => data(api.get('/categories')),
  create: (body) => data(api.post('/categories', body)),
  update: (id, body) => data(api.put(`/categories/${id}`, body)),
  remove: (id) => data(api.delete(`/categories/${id}`)),
};

export const itemsApi = {
  list: (params) => data(api.get('/items', { params: clean(params) })),
  get: (id) => data(api.get(`/items/${id}`)),
  history: (id, params) => data(api.get(`/items/${id}/movements`, { params: clean(params) })),
  create: (body) => data(api.post('/items', body)),
  update: (id, body) => data(api.put(`/items/${id}`, body)),
  remove: (id) => data(api.delete(`/items/${id}`)),
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return data(api.post(`/items/${id}/image`, form));
  },
};

export const movementsApi = {
  list: (params) => data(api.get('/movements', { params: clean(params) })),
  create: (body) => data(api.post('/movements', body)),
};

export const suppliersApi = {
  list: (params) => data(api.get('/suppliers', { params: clean(params) })),
  get: (id) => data(api.get(`/suppliers/${id}`)),
  create: (body) => data(api.post('/suppliers', body)),
  update: (id, body) => data(api.put(`/suppliers/${id}`, body)),
  remove: (id) => data(api.delete(`/suppliers/${id}`)),
};

export const purchaseOrdersApi = {
  list: (params) => data(api.get('/purchase-orders', { params: clean(params) })),
  get: (id) => data(api.get(`/purchase-orders/${id}`)),
  create: (body) => data(api.post('/purchase-orders', body)),
  update: (id, body) => data(api.put(`/purchase-orders/${id}`, body)),
  action: (id, action, note) => data(api.post(`/purchase-orders/${id}/${action}`, { note })),
  receive: (id, body) => data(api.post(`/purchase-orders/${id}/receive`, body)),
};

export const optimizationApi = {
  recommendations: () => data(api.get('/optimization/recommendations')),
  item: (id) => data(api.get(`/optimization/items/${id}`)),
  applyReorderPoint: (id) => data(api.post(`/optimization/items/${id}/apply-reorder-point`)),
  createOrders: (items) => data(api.post('/optimization/purchase-orders', { items })),
};

export const reportsApi = {
  list: () => data(api.get('/reports')),
  run: (key, params) => data(api.get(`/reports/${key}`, { params: clean(params) })),
};

export const notificationsApi = {
  list: (params) => data(api.get('/notifications', { params: clean(params) })),
  unreadCount: () => data(api.get('/notifications/unread-count')),
  markRead: (id) => data(api.patch(`/notifications/${id}/read`)),
  markUnread: (id) => data(api.patch(`/notifications/${id}/unread`)),
  markAllRead: () => data(api.patch('/notifications/read-all')),
  scan: () => data(api.post('/notifications/scan')),
};

export const usersApi = {
  list: (params) => data(api.get('/users', { params: clean(params) })),
  create: (body) => data(api.post('/users', body)),
  update: (id, body) => data(api.put(`/users/${id}`, body)),
  resetPassword: (id, password) => data(api.put(`/users/${id}/password`, { password })),
  remove: (id) => data(api.delete(`/users/${id}`)),
};

export const settingsApi = {
  get: () => data(api.get('/settings')),
  update: (body) => data(api.put('/settings', body)),
};

export const auditApi = {
  list: (params) => data(api.get('/audit-logs', { params: clean(params) })),
};
