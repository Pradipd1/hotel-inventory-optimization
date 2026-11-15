export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'inventory_manager',
  STAFF: 'staff',
});
export const ALL_ROLES = Object.values(ROLES);
export const MANAGEMENT_ROLES = [ROLES.ADMIN, ROLES.MANAGER];

export const MOVEMENT_TYPES = Object.freeze({
  IN: 'stock_in',
  OUT: 'stock_out',
  ADJUSTMENT: 'adjustment',
  RETURN: 'return',
  TRANSFER: 'transfer',
  WASTAGE: 'wastage',
});
export const ALL_MOVEMENT_TYPES = Object.values(MOVEMENT_TYPES);

export const STOCK_STATUS = Object.freeze({
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  OVERSTOCKED: 'overstocked',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRED: 'expired',
});

export const PO_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
});
export const ALL_PO_STATUS = Object.values(PO_STATUS);
export const OPEN_PO_STATUS = [
  PO_STATUS.PENDING_APPROVAL,
  PO_STATUS.APPROVED,
  PO_STATUS.ORDERED,
  PO_STATUS.PARTIALLY_RECEIVED,
];

export const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'pack', 'box', 'bottle', 'roll', 'pair', 'set', 'carton', 'dozen'];

export const SEVERITY = Object.freeze({ INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' });

export const NOTIFICATION_TYPES = Object.freeze({
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  OVERSTOCK: 'overstock',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRING_CRITICAL: 'expiring_critical',
  EXPIRED: 'expired',
  PO_PENDING_APPROVAL: 'po_pending_approval',
  PO_STATUS: 'po_status',
  STOCK_ADJUSTMENT: 'stock_adjustment',
});
