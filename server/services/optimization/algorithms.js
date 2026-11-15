/**
 * Inventory optimization algorithms: pure, deterministic and explainable functions
 * with no database access, so each one can be unit-tested and explained on its own.
 *
 * Forecasting is a Simple Moving Average (SMA). It is a classical statistical method,
 * not machine learning, and is presented as such in the UI.
 */
import { addDays, format, startOfDay } from 'date-fns';

export const round = (n, d = 2) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d : n);

export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}

/** Sample standard deviation. */
export function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1));
}

/**
 * Buckets consumption records ({ date, quantity }) into a continuous daily series from
 * startDate to endDate inclusive. Days without consumption are 0, which matters: a moving
 * average over only the days with records would overstate demand.
 */
export function buildDailySeries(records, startDate, endDate) {
  const totals = new Map();
  for (const r of records) {
    const key = format(new Date(r.date), 'yyyy-MM-dd');
    totals.set(key, (totals.get(key) || 0) + Number(r.quantity || 0));
  }
  const series = [];
  const end = startOfDay(endDate);
  for (let d = startOfDay(startDate); d <= end; d = addDays(d, 1)) {
    const key = format(d, 'yyyy-MM-dd');
    series.push({ date: key, quantity: round(totals.get(key) || 0, 3) });
  }
  return series;
}

/** Simple moving average of the last `window` values (or all values if fewer). */
export function simpleMovingAverage(values, window) {
  if (!values.length || window <= 0) return 0;
  return mean(values.slice(-window));
}

/** Rolling SMA for charting; entries before a full window are null. */
export function movingAverageSeries(values, window) {
  return values.map((_, i) => (i + 1 < window ? null : mean(values.slice(i + 1 - window, i + 1))));
}

/**
 * Data-quality indicator for a forecast, based on how much history exists and how
 * volatile it is (coefficient of variation = std dev / mean).
 */
export function assessDataQuality({ historyDays, nonZeroDays, coefficientOfVariation }) {
  const cv = coefficientOfVariation;
  if (historyDays < 7 || nonZeroDays < 3) {
    return {
      level: 'insufficient',
      label: 'Insufficient data',
      note: `Only ${historyDays} day(s) of history with ${nonZeroDays} day(s) of recorded consumption. At least 7 days and 3 consumption days are needed.`,
    };
  }
  if (historyDays < 14 || cv > 1.5) {
    return { level: 'low', label: 'Low', note: historyDays < 14 ? 'Less than 14 days of history.' : 'Consumption is highly irregular.' };
  }
  if (historyDays < 30 || cv > 0.75) {
    return { level: 'medium', label: 'Medium', note: historyDays < 30 ? 'Less than 30 days of history.' : 'Consumption varies noticeably day to day.' };
  }
  return { level: 'high', label: 'High', note: '30+ days of history with fairly stable consumption.' };
}

/**
 * Demand forecast with a simple moving average.
 * @param {number[]} dailyValues  consumption per day, oldest first, including zero days
 * @param {{window?: number, horizonDays?: number}} options
 */
export function forecastDemand(dailyValues, { window = 30, horizonDays = 30 } = {}) {
  const historyDays = dailyValues.length;
  const effectiveWindow = Math.min(window, historyDays);
  const recent = dailyValues.slice(-effectiveWindow);
  const avgDailyDemand = effectiveWindow ? mean(recent) : 0;
  const sd = stdDev(recent);
  const nonZeroDays = recent.filter((v) => v > 0).length;
  const cv = avgDailyDemand > 0 ? sd / avgDailyDemand : 0;
  const sma7 = simpleMovingAverage(dailyValues, Math.min(7, historyDays));

  // Trend: compares the last 7 days with the full window (±15% threshold).
  let trend = 'stable';
  if (avgDailyDemand > 0 && historyDays >= 14) {
    const ratio = sma7 / avgDailyDemand;
    if (ratio > 1.15) trend = 'rising';
    else if (ratio < 0.85) trend = 'falling';
  }

  return {
    method: `Simple moving average (${effectiveWindow}-day window)`,
    windowDays: effectiveWindow,
    horizonDays,
    historyDays,
    totalConsumed: round(sum(recent), 3),
    nonZeroDays,
    avgDailyDemand: round(avgDailyDemand, 3),
    sma7: round(sma7, 3),
    stdDevDaily: round(sd, 3),
    coefficientOfVariation: round(cv, 3),
    predictedDemand: round(avgDailyDemand * horizonDays, 2),
    trend,
    dataQuality: assessDataQuality({ historyDays, nonZeroDays, coefficientOfVariation: cv }),
  };
}

/**
 * Economic Order Quantity: EOQ = sqrt((2 × D × S) / H)
 * D = annual demand (units/year), S = ordering cost per order, H = annual holding cost per unit.
 * Returns canCalculate=false with the list of missing inputs instead of inventing values.
 */
export function economicOrderQuantity({ annualDemand, orderingCost, holdingCost }) {
  const missing = [];
  if (!(annualDemand > 0)) missing.push('annual demand (no consumption history)');
  if (orderingCost == null || !(orderingCost > 0)) missing.push('ordering cost per order (S)');
  if (holdingCost == null || !(holdingCost > 0)) missing.push('annual holding cost per unit (H)');
  if (missing.length) return { canCalculate: false, value: null, missing };
  return {
    canCalculate: true,
    value: round(Math.sqrt((2 * annualDemand * orderingCost) / holdingCost), 2),
    missing: [],
  };
}

/** Reorder Point = (Average Daily Demand × Lead Time) + Safety Stock */
export function calculateReorderPoint({ avgDailyDemand, leadTimeDays, safetyStock = 0 }) {
  if (leadTimeDays == null || leadTimeDays < 0) {
    return { canCalculate: false, value: null, missing: ['supplier lead time'] };
  }
  return {
    canCalculate: true,
    value: round(avgDailyDemand * leadTimeDays + (safetyStock || 0), 2),
    missing: [],
  };
}

/**
 * Optional statistical safety-stock hint: z × σ(daily) × √(lead time), z = 1.65 (~95% service level).
 * Shown as guidance only; the configured safety stock is what the engine uses.
 */
export function statisticalSafetyStock({ stdDevDaily, leadTimeDays, z = 1.65 }) {
  if (leadTimeDays == null || !(stdDevDaily > 0)) return null;
  return round(z * stdDevDaily * Math.sqrt(leadTimeDays), 2);
}

/**
 * Suggested reorder quantity.
 * 1. If EOQ is available: max(EOQ, quantity needed to get back to the reorder point).
 * 2. Else if a maximum stock level is configured: order up to the maximum.
 * 3. Else: shortfall to reorder point + forecast demand over the horizon.
 * Never pushes stock above the configured maximum unless that is required to reach the reorder point.
 */
export function suggestOrderQuantity({ currentStock, reorderPoint, eoq, maxStock, avgDailyDemand, horizonDays }) {
  const shortfall = Math.max(0, reorderPoint - currentStock);
  let quantity;
  let basis;
  if (eoq > 0) {
    quantity = Math.max(eoq, shortfall);
    basis = eoq >= shortfall ? 'Economic Order Quantity (EOQ)' : 'Shortfall to reorder point (larger than EOQ)';
  } else if (maxStock > 0) {
    quantity = maxStock - currentStock;
    basis = 'Order up to maximum stock level (EOQ not available)';
  } else {
    quantity = shortfall + avgDailyDemand * horizonDays;
    basis = `Shortfall to reorder point + ${horizonDays}-day forecast demand (EOQ not available)`;
  }
  if (maxStock > 0 && currentStock + quantity > maxStock) {
    const capped = Math.max(shortfall, maxStock - currentStock);
    if (capped < quantity) {
      quantity = capped;
      basis += ', capped at maximum stock level';
    }
  }
  return { quantity: Math.max(0, Math.ceil(quantity)), basis };
}

/** Days the current stock will last at the average daily demand. */
export function daysOfCover(currentStock, avgDailyDemand) {
  if (!(avgDailyDemand > 0)) return null;
  return round(currentStock / avgDailyDemand, 1);
}

/**
 * Priority for a reorder recommendation.
 * critical: out of stock, or stock runs out before a new delivery could arrive
 * high:     at or below the reorder point
 * medium:   within 20% above the reorder point (plan an order soon)
 */
export function reorderPriority({ currentStock, reorderPoint, cover, leadTimeDays }) {
  if (currentStock <= 0) return 'critical';
  if (cover != null && leadTimeDays != null && cover < leadTimeDays) return 'critical';
  if (currentStock <= reorderPoint) return 'high';
  if (currentStock <= reorderPoint * 1.2) return 'medium';
  return null;
}

/**
 * Wastage risk for a perishable item: stock that will not be consumed before it expires
 * at the current average consumption rate.
 */
export function expiryWastageRisk({ currentStock, avgDailyDemand, daysToExpiry, unitCost }) {
  if (daysToExpiry == null) return null;
  const usableDays = Math.max(0, daysToExpiry);
  const projectedUse = avgDailyDemand * usableDays;
  const atRiskQty = daysToExpiry < 0 ? currentStock : Math.max(0, currentStock - projectedUse);
  return {
    projectedConsumptionBeforeExpiry: round(Math.min(currentStock, projectedUse), 2),
    atRiskQuantity: round(atRiskQty, 2),
    atRiskValue: round(atRiskQty * unitCost, 2),
  };
}
