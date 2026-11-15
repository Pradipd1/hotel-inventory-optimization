/** Demo data for "Himalayan Grand Hotel" (fictional). Prices in NPR. */

export const HOTEL = {
  name: 'Himalayan Grand Hotel',
  code: 'HGH',
  address: 'Durbar Marg, Kathmandu, Nepal',
  phone: '+977 1-4220000',
  email: 'stores@himalayangrand.example',
  settings: {
    currency: 'NPR',
    expiryWarningDays: 30,
    expiryCriticalDays: 7,
    forecastWindowDays: 30,
    forecastHorizonDays: 30,
    defaultOrderingCost: 800, // S: admin + delivery cost per purchase order
    holdingCostRate: 20, // H: 20% of unit cost per year (storage, capital, spoilage)
    significantAdjustmentValue: 5000,
    defaultTaxRate: 13, // Nepal VAT
  },
};

export const USERS = [
  { key: 'admin', name: 'Rajesh Karki', email: 'admin@demo.com', password: 'Admin@123', role: 'admin', department: 'Administration' },
  { key: 'manager', name: 'Anita Shrestha', email: 'manager@demo.com', password: 'Manager@123', role: 'inventory_manager', department: 'Stores' },
  { key: 'staff', name: 'Bikash Thapa', email: 'staff@demo.com', password: 'Staff@123', role: 'staff', department: 'Kitchen' },
  {
    key: 'housekeeping', name: 'Sunita Gurung', email: 'housekeeping@demo.com', password: 'Staff@123', role: 'staff', department: 'Housekeeping',
    assignedCategories: ['Toiletries', 'Guest Room Supplies', 'Cleaning Materials'],
  },
];

export const CATEGORIES = [
  { name: 'Food and Beverages', color: '#1e40af', description: 'Dry goods, dairy and drinks for kitchen and F&B outlets' },
  { name: 'Kitchen Supplies', color: '#0891b2', description: 'Disposables and consumables used in the kitchen' },
  { name: 'Cleaning Materials', color: '#059669', description: 'Chemicals and liquids for housekeeping and kitchen' },
  { name: 'Toiletries', color: '#7c3aed', description: 'Guest bathroom amenities' },
  { name: 'Guest Room Supplies', color: '#db2777', description: 'Linen and in-room items' },
  { name: 'Maintenance Equipment', color: '#ea580c', description: 'Spare parts and engineering consumables' },
  { name: 'Office Supplies', color: '#64748b', description: 'Front office and back office stationery' },
  { name: 'Other', color: '#a16207', description: 'Miscellaneous items' },
];

export const SUPPLIERS = [
  { key: 'annapurna', name: 'Annapurna Food Suppliers', companyName: 'Annapurna Food Suppliers Pvt. Ltd.', contactPerson: 'Ramesh Adhikari', email: 'orders@annapurnafoods.example', phone: '+977 1-4433210', address: 'Kalimati, Kathmandu', paymentTerms: 'Net 15', leadTimeDays: 3 },
  { key: 'everest', name: 'Everest Beverages', companyName: 'Everest Beverages Pvt. Ltd.', contactPerson: 'Pooja Rai', email: 'sales@everestbev.example', phone: '+977 1-5521876', address: 'Balaju Industrial Area, Kathmandu', paymentTerms: 'Net 30', leadTimeDays: 4 },
  { key: 'cleanpro', name: 'CleanPro Nepal', companyName: 'CleanPro Nepal Traders', contactPerson: 'Suman Maharjan', email: 'info@cleanpronepal.example', phone: '+977 1-5260044', address: 'Lagankhel, Lalitpur', paymentTerms: 'Net 30', leadTimeDays: 5 },
  { key: 'himal', name: 'Himal Hygiene Products', companyName: 'Himal Hygiene Products Pvt. Ltd.', contactPerson: 'Kabita Joshi', email: 'orders@himalhygiene.example', phone: '+977 1-4115920', address: 'Bhaktapur Industrial Estate', paymentTerms: 'Net 45', leadTimeDays: 6 },
  { key: 'linen', name: 'Comfort Linen House', companyName: 'Comfort Linen House', contactPerson: 'Deepak Shah', email: 'deepak@comfortlinen.example', phone: '+977 1-4782211', address: 'New Road, Kathmandu', paymentTerms: '50% advance, 50% on delivery', leadTimeDays: 10 },
  { key: 'hardware', name: 'Kathmandu Office & Hardware', companyName: 'KTM Office & Hardware Centre', contactPerson: 'Nabin Shrestha', email: 'nabin@ktmhardware.example', phone: '+977 1-4256677', address: 'Putalisadak, Kathmandu', paymentTerms: 'Cash on delivery', leadTimeDays: 7 },
  { key: 'valley', name: 'Valley Wholesale Traders', companyName: 'Valley Wholesale Traders', contactPerson: 'Hari Bista', email: 'hari@valleywholesale.example', phone: '+977 1-4100200', address: 'Teku, Kathmandu', paymentTerms: 'Net 15', leadTimeDays: 2, status: 'inactive', notes: 'Suspended after repeated late deliveries.' },
];

/**
 * daily: average daily consumption used by the simulation (the engine never sees this value:
 * it re-derives demand from the generated consumption records).
 * target: today's closing stock used to stage demo scenarios.
 * expiryInDays: relative expiry date (negative = already expired).
 */
export const ITEMS = [
  { name: 'Basmati Rice', sku: 'FB-RICE-01', category: 'Food and Beverages', unit: 'kg', unitCost: 165, daily: 18, minStock: 50, maxStock: 400, reorderPoint: 90, safetyStock: 25, supplier: 'annapurna', location: 'Dry Store', expiryInDays: 180, dept: 'Kitchen', target: 48, description: 'Long-grain basmati rice, 25 kg sacks.' },
  { name: 'Wheat Flour (Atta)', sku: 'FB-FLOUR-01', category: 'Food and Beverages', unit: 'kg', unitCost: 75, daily: 9, minStock: 25, maxStock: 200, reorderPoint: 45, safetyStock: 15, supplier: 'annapurna', location: 'Dry Store', expiryInDays: 25, dept: 'Kitchen', target: 38 },
  { name: 'Sunflower Cooking Oil', sku: 'FB-OIL-01', category: 'Food and Beverages', unit: 'litre', unitCost: 290, daily: 6, minStock: 20, maxStock: 150, reorderPoint: 35, safetyStock: 10, supplier: 'annapurna', location: 'Dry Store', expiryInDays: 200, dept: 'Kitchen', target: 22 },
  { name: 'Sugar', sku: 'FB-SUGAR-01', category: 'Food and Beverages', unit: 'kg', unitCost: 110, daily: 5, minStock: 15, maxStock: 120, reorderPoint: 30, safetyStock: 8, supplier: 'annapurna', location: 'Dry Store', expiryInDays: 300, dept: 'Restaurant', target: 26 },
  { name: 'Ilam Orthodox Tea', sku: 'FB-TEA-01', category: 'Food and Beverages', unit: 'kg', unitCost: 1200, daily: 0.6, minStock: 2, maxStock: 15, reorderPoint: 4, safetyStock: 1, supplier: 'everest', location: 'Dry Store', expiryInDays: 240, dept: 'Restaurant' },
  { name: 'Arabica Coffee Beans', sku: 'FB-COFFEE-01', category: 'Food and Beverages', unit: 'kg', unitCost: 2400, daily: 0.9, minStock: 3, maxStock: 20, reorderPoint: 6, safetyStock: 1.5, supplier: 'everest', location: 'Dry Store', expiryInDays: 20, dept: 'Restaurant', target: 5 },
  { name: 'Mineral Water 1L', sku: 'FB-WATER-01', category: 'Food and Beverages', unit: 'bottle', unitCost: 25, daily: 140, minStock: 300, maxStock: 2000, reorderPoint: 700, safetyStock: 150, supplier: 'everest', location: 'Beverage Store', expiryInDays: 5, dept: 'Housekeeping' },
  { name: 'Fresh Milk', sku: 'FB-MILK-01', category: 'Food and Beverages', unit: 'litre', unitCost: 95, daily: 25, minStock: 30, maxStock: 200, reorderPoint: 60, safetyStock: 15, supplier: 'annapurna', leadTimeDays: 1, location: 'Cold Room', expiryInDays: -2, dept: 'Kitchen', target: 32, wastageEvery: 15 },
  { name: 'Nitrile Kitchen Gloves', sku: 'KS-GLOVE-01', category: 'Kitchen Supplies', unit: 'box', unitCost: 650, daily: 0.8, minStock: 4, maxStock: 30, reorderPoint: 8, safetyStock: 2, supplier: 'cleanpro', location: 'Kitchen Store', dept: 'Kitchen' },
  { name: 'Aluminium Foil Roll', sku: 'KS-FOIL-01', category: 'Kitchen Supplies', unit: 'roll', unitCost: 450, daily: 0.5, minStock: 3, maxStock: 20, reorderPoint: 5, supplier: 'hardware', location: 'Kitchen Store', dept: 'Kitchen' },
  { name: 'Multi-surface Cleaning Liquid', sku: 'CM-CLEAN-01', category: 'Cleaning Materials', unit: 'litre', unitCost: 180, daily: 4, minStock: 15, maxStock: 100, reorderPoint: 30, safetyStock: 8, supplier: 'cleanpro', location: 'Housekeeping Store', expiryInDays: 400, dept: 'Housekeeping' },
  { name: 'Dishwashing Liquid', sku: 'CM-DISH-01', category: 'Cleaning Materials', unit: 'litre', unitCost: 210, daily: 3, minStock: 10, maxStock: 80, reorderPoint: 22, safetyStock: 6, supplier: 'cleanpro', location: 'Kitchen Store', dept: 'Kitchen' },
  { name: 'Hand Wash 500ml', sku: 'TL-HANDW-01', category: 'Toiletries', unit: 'bottle', unitCost: 160, daily: 7, minStock: 25, maxStock: 200, reorderPoint: 55, safetyStock: 12, supplier: 'himal', location: 'Housekeeping Store', expiryInDays: 365, dept: 'Housekeeping' },
  { name: 'Guest Shampoo 30ml', sku: 'TL-SHAMP-01', category: 'Toiletries', unit: 'bottle', unitCost: 35, daily: 45, minStock: 150, maxStock: 1500, reorderPoint: 360, safetyStock: 80, supplier: 'himal', location: 'Housekeeping Store', expiryInDays: 500, dept: 'Housekeeping' },
  { name: 'Toilet Paper Roll', sku: 'TL-TPAPER-01', category: 'Toiletries', unit: 'roll', unitCost: 38, daily: 60, minStock: 200, maxStock: 2000, reorderPoint: 500, safetyStock: 120, supplier: 'himal', location: 'Housekeeping Store', dept: 'Housekeeping', target: 0 },
  { name: 'Bath Towel (White)', sku: 'GR-TOWEL-01', category: 'Guest Room Supplies', unit: 'piece', unitCost: 850, daily: 1.5, minStock: 30, maxStock: 150, reorderPoint: 40, safetyStock: 10, supplier: 'linen', orderingCost: 1500, location: 'Linen Room', dept: 'Housekeeping', target: 185 },
  { name: 'King Bedsheet', sku: 'GR-BEDSH-01', category: 'Guest Room Supplies', unit: 'piece', unitCost: 1900, daily: 1, minStock: 25, maxStock: 120, reorderPoint: 30, safetyStock: 8, supplier: 'linen', orderingCost: 1500, location: 'Linen Room', dept: 'Housekeeping' },
  { name: 'Guest Slippers', sku: 'GR-SLIP-01', category: 'Guest Room Supplies', unit: 'pair', unitCost: 60, daily: 35, minStock: 120, maxStock: 1000, reorderPoint: 300, safetyStock: 70, supplier: 'himal', location: 'Housekeeping Store', dept: 'Housekeeping' },
  { name: 'LED Bulb 9W', sku: 'ME-BULB-01', category: 'Maintenance Equipment', unit: 'piece', unitCost: 220, daily: 0.7, minStock: 10, maxStock: 60, reorderPoint: 15, supplier: 'hardware', location: 'Engineering Store', dept: 'Engineering' },
  { name: 'A4 Printer Paper', sku: 'OS-A4-01', category: 'Office Supplies', unit: 'pack', unitCost: 650, daily: 0.4, minStock: 4, maxStock: 30, reorderPoint: 7, safetyStock: 1, supplier: 'hardware', location: 'Front Office', dept: 'Front Office' },
];

export const INTEGER_UNITS = new Set(['piece', 'pack', 'box', 'bottle', 'roll', 'pair', 'set', 'carton', 'dozen']);
