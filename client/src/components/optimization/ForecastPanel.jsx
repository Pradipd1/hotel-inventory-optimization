import { useState } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { optimizationApi } from '../../services/endpoints.js';
import { errorMessage } from '../../services/api.js';
import { Card, DataState, KeyValue, StatusBadge } from '../ui/Display.jsx';
import { Button } from '../ui/Button.jsx';
import { ConfirmDialog } from '../ui/Modal.jsx';
import { ForecastChart } from '../charts/Charts.jsx';
import { DATA_QUALITY } from '../../utils/constants.js';
import { formatCurrency, formatNumber, formatQty } from '../../utils/format.js';

const TREND = { rising: '↑ Rising', falling: '↓ Falling', stable: '→ Stable' };

/** Explains the engine's numbers for one item: forecast, ROP, EOQ and the inputs used. */
export function ForecastPanel({ itemId, version = 0, onApplied }) {
  const { currency } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const { data, loading, error, reload } = useApi(() => optimizationApi.item(itemId), [itemId, version]);
  const f = data?.data;

  const apply = async () => {
    try {
      const res = await optimizationApi.applyReorderPoint(itemId);
      toast.success(res.message);
      setConfirm(false);
      onApplied?.();
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const unit = f?.item.unit;
  const p = f?.parameters;
  const canApply = f?.calculatedReorderPoint.canCalculate && Math.ceil(f.calculatedReorderPoint.value) !== f.item.configuredReorderPoint;

  return (
    <Card
      title="Demand forecast & optimization"
      subtitle={f ? `${f.forecast.method} · ${f.forecast.historyDays} days of history` : 'Simple moving average on recorded consumption'}
      actions={f && <StatusBadge map={DATA_QUALITY} value={f.forecast.dataQuality.level} />}
    >
      <DataState loading={loading && !f} error={error} onRetry={reload}>
        {f && (
          <div className="space-y-5">
            {f.history.length > 0 ? (
              <ForecastChart history={f.history} projection={f.projection} unit={unit} />
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No consumption recorded yet. Forecasts appear once stock-out movements are recorded.</p>
            )}
            <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              Data quality: {f.forecast.dataQuality.note} This is a statistical average of past consumption, not an AI prediction.
            </p>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KeyValue label="Avg daily demand">{formatQty(f.forecast.avgDailyDemand, unit)}</KeyValue>
              <KeyValue label={`Forecast (${f.forecast.horizonDays} days)`}>{formatQty(f.forecast.predictedDemand, unit)}</KeyValue>
              <KeyValue label="Last 7 days avg">{formatQty(f.forecast.sma7, unit)} · {TREND[f.forecast.trend]}</KeyValue>
              <KeyValue label="Days of cover">{f.daysOfCover != null ? `${formatNumber(f.daysOfCover, 1)} days` : '—'}</KeyValue>
              <KeyValue label="Reorder point (calculated)">
                {f.calculatedReorderPoint.canCalculate ? formatQty(f.calculatedReorderPoint.value, unit) : <span className="text-amber-700">Cannot calculate: {f.calculatedReorderPoint.missing.join(', ')}</span>}
              </KeyValue>
              <KeyValue label="Reorder point (configured)">{formatQty(f.item.configuredReorderPoint, unit)}</KeyValue>
              <KeyValue label="EOQ">
                {f.eoq.canCalculate ? formatQty(f.eoq.value, unit) : <span className="text-amber-700">Cannot calculate: {f.eoq.missing.join(', ')}</span>}
              </KeyValue>
              <KeyValue label="On order">{formatQty(f.orders.onOrder, unit)}{f.orders.onOrderPOs.length ? ` (${f.orders.onOrderPOs.join(', ')})` : ''}</KeyValue>
            </dl>
            <details className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">How these numbers were calculated</summary>
              <ul className="mt-3 space-y-1.5 text-slate-600">
                <li><b>Average daily demand</b> = total consumed in the last {f.forecast.windowDays} days ({formatQty(f.forecast.totalConsumed, unit)}) ÷ {f.forecast.windowDays} = {formatQty(f.forecast.avgDailyDemand, unit)}/day</li>
                <li><b>Reorder point</b> = avg daily demand × lead time + safety stock = {formatNumber(f.forecast.avgDailyDemand)} × {p.leadTimeDays ?? '?'} {p.leadTimeSource ? `(${p.leadTimeSource})` : ''} + {formatNumber(p.safetyStock)}{p.safetyStockConfigured ? '' : ' (not configured, 0 used)'}</li>
                <li><b>EOQ</b> = √(2 × D × S ÷ H) with D = {formatNumber(p.annualDemand)} {unit}/year, S = {p.orderingCost != null ? `${formatCurrency(p.orderingCost, currency)} (${p.orderingCostSource})` : 'not set'}, H = {p.holdingCost != null ? `${formatCurrency(p.holdingCost, currency)} (${p.holdingCostSource})` : 'not set'}</li>
                {f.suggestedSafetyStock != null && <li><b>Statistical safety stock hint</b> (95% service level, z = 1.65 × σ × √lead time): {formatQty(f.suggestedSafetyStock, unit)}</li>}
                <li><b>Suggested order</b> now: {formatQty(f.suggestedOrder.quantity, unit)} ({f.suggestedOrder.basis})</li>
              </ul>
            </details>
            {canApply && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                <p className="text-sm text-brand-900">
                  The calculated reorder point ({formatQty(Math.ceil(f.calculatedReorderPoint.value), unit)}) differs from the configured value ({formatQty(f.item.configuredReorderPoint, unit)}).
                </p>
                <Button size="sm" icon={CheckCircle2} onClick={() => setConfirm(true)}>Apply calculated reorder point</Button>
              </div>
            )}
          </div>
        )}
      </DataState>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={apply}
        variant="primary"
        title="Update reorder point?"
        message={f && `Set the reorder point of ${f.item.name} to ${Math.ceil(f.calculatedReorderPoint.value ?? 0)} ${unit}? Low-stock alerts will use the new value.`}
        confirmLabel="Apply"
      />
    </Card>
  );
}
