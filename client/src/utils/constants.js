export const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'pack', 'box', 'bottle', 'roll', 'pair', 'set', 'carton', 'dozen'];

export const STOCK_STATUS = {
  in_stock: { label: 'In stock', tone: 'green' },
  low_stock: { label: 'Low stock', tone: 'amber' },
  out_of_stock: { label: 'Out of stock', tone: 'red' },
  overstocked: { label: 'Overstocked', tone: 'blue' },
  expiring_soon: { label: 'Expiring soon', tone: 'amber' },
  expired: { label: 'Expired', tone: 'red' },
};

export const EXPIRY_STATUS = {
  expired: { label: 'Expired', tone: 'red' },
  expiring_critical: { label: 'Expires ≤ 7 days', tone: 'red' },
  expiring_soon: { label: 'Expiring soon', tone: 'amber' },
  ok: { label: 'OK', tone: 'gray' },
};

export const MOVEMENT_TYPES = {
  stock_in: { label: 'Stock In', tone: 'green', sign: '+' },
  stock_out: { label: 'Stock Out', tone: 'slate', sign: '−' },
  adjustment: { label: 'Adjustment', tone: 'purple' },
  return: { label: 'Return', tone: 'blue' },
  transfer: { label: 'Transfer', tone: 'gray' },
  wastage: { label: 'Wastage', tone: 'red', sign: '−' },
};

export const PO_STATUS = {
  draft: { label: 'Draft', tone: 'gray' },
  pending_approval: { label: 'Pending approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  ordered: { label: 'Ordered', tone: 'purple' },
  partially_received: { label: 'Partially received', tone: 'amber' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const PRIORITY = {
  critical: { label: 'Critical', tone: 'red' },
  high: { label: 'High', tone: 'amber' },
  medium: { label: 'Medium', tone: 'blue' },
  low: { label: 'Low', tone: 'gray' },
};

export const SEVERITY = {
  critical: { label: 'Critical', tone: 'red' },
  warning: { label: 'Warning', tone: 'amber' },
  info: { label: 'Info', tone: 'blue' },
};

export const DATA_QUALITY = {
  high: { label: 'High', tone: 'green' },
  medium: { label: 'Medium', tone: 'blue' },
  low: { label: 'Low', tone: 'amber' },
  insufficient: { label: 'Insufficient', tone: 'red' },
};

export const DEPARTMENTS = ['Kitchen', 'Restaurant', 'Bar', 'Housekeeping', 'Front Office', 'Engineering', 'Banquet', 'Laundry', 'Administration'];

/** Chart palette: navy-led, distinguishable in sequence. */
export const CHART_COLORS = ['#1e3a8a', '#0891b2', '#059669', '#d97706', '#7c3aed', '#db2777', '#64748b', '#ea580c'];
