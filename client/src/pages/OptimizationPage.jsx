import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, CalendarClock, Gauge, Info, LineChart, PackageSearch, RefreshCw, ShoppingCart, Warehouse } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { optimizationApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Badge, Card, DataState, PageHeader, StatCard, StatusBadge, Tabs } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Form.jsx';
import { DataTable } from '../components/ui/Table.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { ForecastPanel } from '../components/optimization/ForecastPanel.jsx';
import { DATA_QUALITY, EXPIRY_STATUS, PRIORITY } from '../utils/constants.js';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatQty } from '../utils/format.js';

export default function OptimizationPage() {
  const { currency } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => optimizationApi.recommendations(), []);
  const r = data?.data;
  const [tab, setTab] = useState('reorder');
  const [selected, setSelected] = useState({}); // itemId -> quantity
  const [forecastItem, setForecastItem] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => setSelected({}), [r]);

  const reorderById = useMemo(() => new Map((r?.reorder || []).map((x) => [x.item._id, x])), [r]);
  const chosen = Object.entries(selected).map(([id, q]) => ({ rec: reorderById.get(id), quantity: Number(q) })).filter((c) => c.rec);
  const chosenTotal = chosen.reduce((s, c) => s + c.quantity * c.rec.item.unitCost, 0);
  const bySupplier = chosen.reduce((m, c) => {
    const k = c.rec.supplier?.name || 'No supplier';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  const invalid = chosen.some((c) => !(c.quantity > 0) || !c.rec.supplier);

  const toggle = (rec) =>
    setSelected((s) => {
      const n = { ...s };
      if (n[rec.item._id] !== undefined) delete n[rec.item._id];
      else n[rec.item._id] = rec.suggestedQuantity;
      return n;
    });

  const createOrders = async () => {
    setCreating(true);
    try {
      const res = await optimizationApi.createOrders(chosen.map((c) => ({ item: c.rec.item._id, quantity: c.quantity })));
      toast.success(res.message);
      setConfirmOpen(false);
      if (res.data.length === 1) navigate(`/purchase-orders/${res.data[0]._id}`);
      else navigate('/purchase-orders?status=draft');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const reasonRow = (x) => (
    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600"><span className="font-semibold text-slate-700">Why: </span>{x.reason}</p>
  );

  const itemCell = (x) => (
    <button onClick={() => setForecastItem(x.item)} className="text-left">
      <p className="font-medium text-slate-900 hover:text-brand-700">{x.item.name}</p>
      <p className="text-xs text-slate-500">{x.item.sku}</p>
    </button>
  );

  const reorderColumns = [
    {
      key: 'select',
      header: '',
      render: (x) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-800"
          checked={selected[x.item._id] !== undefined}
          onChange={() => toggle(x)}
          disabled={!x.supplier}
          title={x.supplier ? 'Select to create a purchase order' : 'Assign a supplier first'}
          aria-label={`Select ${x.item.name}`}
        />
      ),
    },
    { key: 'priority', header: 'Priority', render: (x) => <StatusBadge map={PRIORITY} value={x.priority} /> },
    { key: 'item', header: 'Product', render: itemCell },
    { key: 'currentStock', header: 'Stock', align: 'right', render: (x) => (
      <div className="whitespace-nowrap">
        <p>{formatQty(x.currentStock, x.item.unit)}</p>
        {x.onOrder > 0 && <p className="text-xs text-blue-600">+{formatQty(x.onOrder)} on order</p>}
      </div>
    ) },
    { key: 'avg', header: 'Avg / day', align: 'right', render: (x) => formatNumber(x.avgDailyDemand) },
    { key: 'rop', header: 'Reorder pt', align: 'right', render: (x) => (
      <div className="whitespace-nowrap">
        <p>{formatNumber(x.reorderPoint)}</p>
        <p className="text-xs text-slate-400">{x.reorderPointSource}</p>
      </div>
    ) },
    { key: 'qty', header: 'Suggested qty', align: 'right', render: (x) => (
      selected[x.item._id] !== undefined ? (
        <Input type="number" min="0" step="any" value={selected[x.item._id]} onChange={(e) => setSelected((s) => ({ ...s, [x.item._id]: e.target.value }))} className="ml-auto w-24 text-right" aria-label="Order quantity" />
      ) : (
        <span className="font-semibold whitespace-nowrap text-slate-900">{formatQty(x.suggestedQuantity, x.item.unit)}</span>
      )
    ) },
    { key: 'cost', header: 'Est. cost', align: 'right', render: (x) => formatCurrency(x.estimatedCost, currency) },
    { key: 'supplier', header: 'Supplier', render: (x) => (x.supplier ? <span className="whitespace-nowrap">{x.supplier.name}</span> : <Badge tone="red">Not assigned</Badge>) },
  ];

  const overstockColumns = [
    { key: 'item', header: 'Product', render: itemCell },
    { key: 'currentStock', header: 'Stock', align: 'right', render: (x) => formatQty(x.currentStock, x.item.unit) },
    { key: 'maxStock', header: 'Maximum', align: 'right', render: (x) => formatQty(x.maxStock) },
    { key: 'excess', header: 'Excess', align: 'right', render: (x) => <span className="font-medium text-blue-700">{formatQty(x.excessQuantity)}</span> },
    { key: 'value', header: 'Excess value', align: 'right', render: (x) => formatCurrency(x.excessValue, currency) },
    { key: 'cover', header: 'Days of stock', align: 'right', render: (x) => (x.daysOfCover != null ? formatNumber(x.daysOfCover, 0) : '—') },
  ];

  const expiryColumns = [
    { key: 'priority', header: 'Priority', render: (x) => <StatusBadge map={PRIORITY} value={x.priority} /> },
    { key: 'item', header: 'Product', render: itemCell },
    { key: 'expiryDate', header: 'Expiry', render: (x) => (
      <div className="whitespace-nowrap">
        <p>{formatDate(x.expiryDate)}</p>
        <StatusBadge map={EXPIRY_STATUS} value={x.expiryStatus} />
      </div>
    ) },
    { key: 'currentStock', header: 'Stock', align: 'right', render: (x) => formatQty(x.currentStock, x.item.unit) },
    { key: 'atRisk', header: 'At risk', align: 'right', render: (x) => <span className="font-medium text-red-700">{formatQty(x.atRiskQuantity)}</span> },
    { key: 'value', header: 'Value at risk', align: 'right', render: (x) => formatCurrency(x.atRiskValue, currency) },
  ];

  const analysisColumns = [
    { key: 'item', header: 'Product', render: itemCell },
    { key: 'stock', header: 'Stock', align: 'right', render: (x) => formatQty(x.item.currentStock, x.item.unit) },
    { key: 'avg', header: 'Avg / day', align: 'right', render: (x) => formatNumber(x.avgDailyDemand) },
    { key: 'pred', header: 'Forecast', align: 'right', render: (x) => formatNumber(x.predictedDemand) },
    { key: 'trend', header: 'Trend', render: (x) => <span className="text-xs capitalize">{x.trend}</span> },
    { key: 'cover', header: 'Days of cover', align: 'right', render: (x) => (x.daysOfCover != null ? formatNumber(x.daysOfCover, 1) : '—') },
    { key: 'lead', header: 'Lead time', align: 'right', render: (x) => (x.leadTimeDays != null ? `${x.leadTimeDays} d` : '—') },
    { key: 'rop', header: 'ROP config / calc', align: 'right', render: (x) => (
      <span className="whitespace-nowrap">{formatNumber(x.configuredReorderPoint)} / {x.calculatedReorderPoint != null ? formatNumber(x.calculatedReorderPoint) : <span title={x.reorderPointMissing.join(', ')} className="text-amber-600">n/a</span>}</span>
    ) },
    { key: 'eoq', header: 'EOQ', align: 'right', render: (x) => (x.eoq != null ? formatNumber(x.eoq, 1) : <span title={`Missing: ${x.eoqMissing.join(', ')}`} className="text-amber-600">n/a</span>) },
    { key: 'quality', header: 'Data quality', render: (x) => <StatusBadge map={DATA_QUALITY} value={x.dataQuality.level} /> },
  ];

  return (
    <>
      <PageHeader
        title="Optimization engine"
        description="Recommendations calculated from recorded consumption, supplier lead times and configured cost parameters."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading}>Recalculate</Button>}
      />
      <DataState loading={loading && !r} error={error} onRetry={reload}>
        {r && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={AlertOctagon} tone="red" label="Reorder recommendations" value={r.summary.reorderCount} hint={`${r.summary.criticalCount} critical`} onClick={() => setTab('reorder')} />
              <StatCard icon={ShoppingCart} tone="brand" label="Estimated reorder cost" value={formatCurrency(r.summary.estimatedReorderCost, currency, { compact: true })} title={formatCurrency(r.summary.estimatedReorderCost, currency)} />
              <StatCard icon={Warehouse} tone="blue" label="Overstocked items" value={r.summary.overstockCount} hint={`${formatCurrency(r.summary.overstockValue, currency)} tied up`} onClick={() => setTab('overstock')} />
              <StatCard icon={CalendarClock} tone="amber" label="Expiry / wastage risks" value={r.summary.expiryRiskCount} hint={`${formatCurrency(r.summary.expiryRiskValue, currency)} at risk`} onClick={() => setTab('expiry')} />
            </div>

            <div className="my-5 flex gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p>
                <b>Method:</b> {r.parameters.method}, {r.parameters.forecastWindowDays}-day window, {r.parameters.forecastHorizonDays}-day forecast horizon.
                Reorder point = average daily demand × lead time + safety stock; reorders compare it with stock on hand plus stock already on order.
                EOQ = √(2DS/H) using ordering cost {r.parameters.defaultOrderingCost != null ? formatCurrency(r.parameters.defaultOrderingCost, currency) : 'not configured'} and holding cost {r.parameters.holdingCostRate != null ? `${r.parameters.holdingCostRate}% of unit cost per year` : 'not configured'} unless set per item.
                Generated {formatDateTime(r.generatedAt)}. Nothing is ordered automatically.
              </p>
            </div>

            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'reorder', label: 'Reorder', count: r.reorder.length },
                { value: 'overstock', label: 'Overstock', count: r.overstock.length },
                { value: 'expiry', label: 'Expiry & wastage', count: r.expiry.length },
                { value: 'analysis', label: 'All items analysis', count: r.analysis.length },
              ]}
            />

            {tab === 'reorder' && (
              <Card
                bodyClassName="p-0"
                title="Items to reorder"
                subtitle="Select items, adjust quantities, then create draft purchase orders (one per supplier)."
                actions={
                  <Button icon={ShoppingCart} disabled={!chosen.length || invalid} onClick={() => setConfirmOpen(true)}>
                    Create draft PO{chosen.length ? ` (${chosen.length})` : ''}
                  </Button>
                }
              >
                <DataTable columns={reorderColumns} rows={r.reorder} rowKey={(x) => x.item._id} renderDetail={reasonRow} emptyProps={{ icon: Gauge, title: 'No reorders needed', message: 'All items are above their reorder point, counting stock already on order.' }} />
              </Card>
            )}
            {tab === 'overstock' && (
              <Card bodyClassName="p-0" title="Overstocked items" subtitle="Stock above the configured maximum level">
                <DataTable columns={overstockColumns} rows={r.overstock} rowKey={(x) => x.item._id} renderDetail={reasonRow} emptyProps={{ icon: Warehouse, title: 'No overstocked items' }} />
              </Card>
            )}
            {tab === 'expiry' && (
              <Card bodyClassName="p-0" title="Expiry and wastage risk" subtitle="Expired, ≤ 7 days and ≤ 30 days, with stock that will not be used in time">
                <DataTable columns={expiryColumns} rows={r.expiry} rowKey={(x) => x.item._id} renderDetail={reasonRow} emptyProps={{ icon: CalendarClock, title: 'No expiry risks' }} />
              </Card>
            )}
            {tab === 'analysis' && (
              <Card bodyClassName="p-0" title="Demand analysis for every item" subtitle="Click a product to see its consumption chart and calculation details">
                <DataTable columns={analysisColumns} rows={r.analysis} rowKey={(x) => x.item._id} emptyProps={{ icon: PackageSearch, title: 'No items to analyse' }} />
              </Card>
            )}
          </>
        )}
      </DataState>

      <Modal open={Boolean(forecastItem)} onClose={() => setForecastItem(null)} size="xl" title={forecastItem?.name} description={<Link className="text-brand-700 hover:underline" to={`/inventory/${forecastItem?._id}`}>Open item page</Link>}>
        {forecastItem && <ForecastPanel itemId={forecastItem._id} onApplied={reload} />}
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Create draft purchase orders?"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button icon={LineChart} loading={creating} onClick={createOrders}>Create drafts</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {chosen.length} item(s) will be added to {Object.keys(bySupplier).length} draft purchase order(s), one per supplier. Drafts still need to be submitted and approved before ordering.
        </p>
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {chosen.map((c) => (
            <li key={c.rec.item._id} className="flex justify-between gap-3 px-3 py-2">
              <span>{c.rec.item.name} <span className="text-slate-400">· {c.rec.supplier?.name}</span></span>
              <span className="tabular-nums">{formatQty(c.quantity, c.rec.item.unit)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-right text-sm font-semibold">Estimated (excl. tax): {formatCurrency(chosenTotal, currency)}</p>
      </Modal>
    </>
  );
}
