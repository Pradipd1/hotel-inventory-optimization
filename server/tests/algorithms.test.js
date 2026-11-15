import { describe, it, expect } from 'vitest';
import {
  assessDataQuality,
  buildDailySeries,
  calculateReorderPoint,
  daysOfCover,
  economicOrderQuantity,
  expiryWastageRisk,
  forecastDemand,
  movingAverageSeries,
  reorderPriority,
  simpleMovingAverage,
  statisticalSafetyStock,
  suggestOrderQuantity,
} from '../services/optimization/algorithms.js';
import { computeExpiryStatus, computeStockStatus } from '../services/inventoryStatus.js';

describe('Low stock detection (rule A)', () => {
  it('flags stock at or below the reorder point', () => {
    expect(computeStockStatus({ currentStock: 40, reorderPoint: 40, maxStock: 300 })).toBe('low_stock');
    expect(computeStockStatus({ currentStock: 39, reorderPoint: 40 })).toBe('low_stock');
    expect(computeStockStatus({ currentStock: 41, reorderPoint: 40, maxStock: 300 })).toBe('in_stock');
  });
  it('distinguishes out of stock and overstocked', () => {
    expect(computeStockStatus({ currentStock: 0, reorderPoint: 40 })).toBe('out_of_stock');
    expect(computeStockStatus({ currentStock: 301, reorderPoint: 40, maxStock: 300 })).toBe('overstocked');
    expect(computeStockStatus({ currentStock: 9999, reorderPoint: 40, maxStock: 0 })).toBe('in_stock'); // no max configured
  });
});

describe('EOQ (rule B)', () => {
  it('computes sqrt(2DS/H)', () => {
    // D = 3650, S = 500, H = 24 -> sqrt(2*3650*500/24) = 390.0...
    const r = economicOrderQuantity({ annualDemand: 3650, orderingCost: 500, holdingCost: 24 });
    expect(r.canCalculate).toBe(true);
    expect(r.value).toBeCloseTo(Math.sqrt((2 * 3650 * 500) / 24), 2);
  });
  it('refuses to calculate when parameters are missing instead of inventing them', () => {
    const r = economicOrderQuantity({ annualDemand: 3650, orderingCost: null, holdingCost: undefined });
    expect(r.canCalculate).toBe(false);
    expect(r.value).toBeNull();
    expect(r.missing).toHaveLength(2);
    expect(economicOrderQuantity({ annualDemand: 0, orderingCost: 500, holdingCost: 24 }).missing[0]).toMatch(/annual demand/);
  });
});

describe('Reorder point (rule C)', () => {
  it('is avg daily demand × lead time + safety stock', () => {
    expect(calculateReorderPoint({ avgDailyDemand: 6, leadTimeDays: 5, safetyStock: 10 }).value).toBe(40);
    expect(calculateReorderPoint({ avgDailyDemand: 2.5, leadTimeDays: 0, safetyStock: 3 }).value).toBe(3);
  });
  it('requires a lead time', () => {
    const r = calculateReorderPoint({ avgDailyDemand: 6, leadTimeDays: null });
    expect(r.canCalculate).toBe(false);
    expect(r.missing).toContain('supplier lead time');
  });
  it('statistical safety stock hint uses z·σ·√L', () => {
    expect(statisticalSafetyStock({ stdDevDaily: 2, leadTimeDays: 4 })).toBeCloseTo(1.65 * 2 * 2, 2);
    expect(statisticalSafetyStock({ stdDevDaily: 0, leadTimeDays: 4 })).toBeNull();
  });
});

describe('Demand forecasting (rule D)', () => {
  it('fills missing days with zero so averages are not overstated', () => {
    const s = buildDailySeries(
      [{ date: new Date(2026, 0, 1, 10), quantity: 4 }, { date: new Date(2026, 0, 1, 15), quantity: 2 }, { date: new Date(2026, 0, 3), quantity: 3 }],
      new Date(2026, 0, 1),
      new Date(2026, 0, 4)
    );
    expect(s.map((d) => d.quantity)).toEqual([6, 0, 3, 0]);
  });
  it('simple moving average uses the last N values', () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5, 6], 3)).toBe(5);
    expect(movingAverageSeries([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
  });
  it('forecasts predicted demand = avg × horizon and reports data quality', () => {
    const values = Array.from({ length: 30 }, (_, i) => (i % 2 ? 9 : 11)); // mean 10, low variance
    const f = forecastDemand(values, { window: 30, horizonDays: 14 });
    expect(f.avgDailyDemand).toBe(10);
    expect(f.predictedDemand).toBe(140);
    expect(f.dataQuality.level).toBe('high');
    expect(f.method).toMatch(/Simple moving average/);
  });
  it('flags insufficient data honestly', () => {
    expect(forecastDemand([5, 0, 4], { window: 30 }).dataQuality.level).toBe('insufficient');
    expect(assessDataQuality({ historyDays: 20, nonZeroDays: 15, coefficientOfVariation: 0.3 }).level).toBe('medium');
    expect(assessDataQuality({ historyDays: 40, nonZeroDays: 30, coefficientOfVariation: 2 }).level).toBe('low');
  });
  it('detects a rising trend', () => {
    const values = [...Array(23).fill(5), ...Array(7).fill(12)];
    expect(forecastDemand(values, { window: 30 }).trend).toBe('rising');
  });
});

describe('Order quantity and priority', () => {
  it('uses EOQ when it covers the shortfall', () => {
    const r = suggestOrderQuantity({ currentStock: 20, reorderPoint: 40, eoq: 95.2, maxStock: 300, avgDailyDemand: 6, horizonDays: 30 });
    expect(r.quantity).toBe(96);
    expect(r.basis).toMatch(/EOQ/);
  });
  it('caps at maximum stock level', () => {
    const r = suggestOrderQuantity({ currentStock: 20, reorderPoint: 40, eoq: 500, maxStock: 300, avgDailyDemand: 6, horizonDays: 30 });
    expect(r.quantity).toBe(280);
    expect(r.basis).toMatch(/capped/);
  });
  it('falls back to order-up-to-max without EOQ', () => {
    const r = suggestOrderQuantity({ currentStock: 10, reorderPoint: 40, eoq: null, maxStock: 200, avgDailyDemand: 6, horizonDays: 30 });
    expect(r.quantity).toBe(190);
  });
  it('falls back to shortfall + forecast without EOQ or max', () => {
    const r = suggestOrderQuantity({ currentStock: 10, reorderPoint: 40, eoq: null, maxStock: 0, avgDailyDemand: 2, horizonDays: 30 });
    expect(r.quantity).toBe(90);
  });
  it('assigns priority from stock, cover and lead time', () => {
    expect(reorderPriority({ currentStock: 0, reorderPoint: 40, cover: 0, leadTimeDays: 5 })).toBe('critical');
    expect(reorderPriority({ currentStock: 12, reorderPoint: 40, cover: 2, leadTimeDays: 5 })).toBe('critical');
    expect(reorderPriority({ currentStock: 35, reorderPoint: 40, cover: 6, leadTimeDays: 5 })).toBe('high');
    expect(reorderPriority({ currentStock: 45, reorderPoint: 40, cover: 8, leadTimeDays: 5 })).toBe('medium');
    expect(reorderPriority({ currentStock: 100, reorderPoint: 40, cover: 20, leadTimeDays: 5 })).toBeNull();
    expect(daysOfCover(30, 6)).toBe(5);
    expect(daysOfCover(30, 0)).toBeNull();
  });
});

describe('Expiry (rule F)', () => {
  const now = new Date(2026, 5, 1);
  const s = { expiryWarningDays: 30, expiryCriticalDays: 7 };
  it('classifies expired / ≤7 days / ≤30 days', () => {
    expect(computeExpiryStatus({ expiryDate: new Date(2026, 4, 30) }, s, now).status).toBe('expired');
    expect(computeExpiryStatus({ expiryDate: new Date(2026, 5, 8) }, s, now).status).toBe('expiring_critical');
    expect(computeExpiryStatus({ expiryDate: new Date(2026, 5, 20) }, s, now).status).toBe('expiring_soon');
    expect(computeExpiryStatus({ expiryDate: new Date(2026, 7, 1) }, s, now).status).toBe('ok');
    expect(computeExpiryStatus({ expiryDate: null }, s, now).status).toBeNull();
  });
  it('estimates stock at risk of wastage before expiry', () => {
    const r = expiryWastageRisk({ currentStock: 100, avgDailyDemand: 5, daysToExpiry: 10, unitCost: 20 });
    expect(r.atRiskQuantity).toBe(50);
    expect(r.atRiskValue).toBe(1000);
    expect(expiryWastageRisk({ currentStock: 40, avgDailyDemand: 5, daysToExpiry: -2, unitCost: 20 }).atRiskQuantity).toBe(40);
  });
});
