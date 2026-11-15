import { useEffect, useState } from 'react';
import { startOfMonth, subMonths } from 'date-fns';
import { Download, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useCategories, useItemOptions, useSuppliers } from '../hooks/useLookups.js';
import { reportsApi } from '../services/endpoints.js';
import { downloadFile, errorMessage } from '../services/api.js';
import { Badge, Card, DataState, EmptyState, PageHeader } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Form.jsx';
import { DataTable } from '../components/ui/Table.jsx';
import { DonutChart, MonthlyBarChart } from '../components/charts/Charts.jsx';
import { MOVEMENT_TYPES, PO_STATUS, STOCK_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate, formatDateTime, formatNumber, toDateInput } from '../utils/format.js';

const STATUS_TONES = { 'Low Stock': 'amber', 'Out Of Stock': 'red', 'In Stock': 'green', Overstocked: 'blue', Expired: 'red', 'Expiring Critical': 'red', 'Expiring Soon': 'amber', Critical: 'red', High: 'amber', Medium: 'blue', Received: 'green', Cancelled: 'red', Wastage: 'red', 'Stock In': 'green' };

function renderCell(value, type, currency) {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': return typeof value === 'number' ? formatCurrency(value, currency) : value;
    case 'number': return typeof value === 'number' ? formatNumber(value, 3) : value;
    case 'date': return formatDate(value);
    case 'datetime': return formatDateTime(value);
    case 'status': return <Badge tone={STATUS_TONES[value] || 'gray'}>{value}</Badge>;
    default: return String(value);
  }
}

export default function ReportsPage() {
  const { currency } = useAuth();
  const toast = useToast();
  const { data: list, loading: listLoading, error: listError, reload: reloadList } = useApi(() => reportsApi.list(), []);
  const { categories } = useCategories();
  const { suppliers } = useSuppliers();
  const { items } = useItemOptions();
  const reports = list?.data || [];

  const [key, setKey] = useState('inventory');
  const [filters, setFilters] = useState({ from: toDateInput(startOfMonth(subMonths(new Date(), 2))), to: toDateInput(new Date()) });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const def = reports.find((r) => r.key === key);
  const has = (f) => def?.filters.includes(f);

  const params = () => {
    if (!def) return {};
    const p = {};
    if (has('dateRange')) Object.assign(p, { from: filters.from, to: filters.to });
    ['category', 'item', 'supplier', 'status', 'movementType', 'poStatus', 'withinDays'].forEach((f) => has(f) && filters[f] && (p[f] = filters[f]));
    return p;
  };

  const run = async () => {
    if (has('dateRange') && filters.from && filters.to && filters.from > filters.to) {
      setRunError('"From" date must be before "To" date');
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const res = await reportsApi.run(key, params());
      setResult(res.data);
    } catch (err) {
      setRunError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (def) run();
  }, [key, def?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (format) => {
    setDownloading(format);
    try {
      await downloadFile(`/reports/${key}`, { ...params(), format }, `${key}-report.${format}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    } finally {
      setDownloading(null);
    }
  };

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <>
      <PageHeader title="Reports & analytics" description="Every report is generated from live database records and can be exported." />
      <DataState loading={listLoading} error={listError} onRetry={reloadList}>
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <Card bodyClassName="p-2" className="h-fit">
            <nav className="space-y-0.5" aria-label="Reports">
              {reports.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { setKey(r.key); setResult(null); }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${key === r.key ? 'bg-brand-50 font-medium text-brand-900' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {r.title.replace(' Report', '')}
                </button>
              ))}
            </nav>
          </Card>

          <div className="min-w-0 space-y-6">
            <Card title={def?.title} subtitle={def?.description}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {has('dateRange') && (
                  <>
                    <Field label="From"><Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /></Field>
                    <Field label="To"><Input type="date" value={filters.to} min={filters.from} onChange={(e) => set({ to: e.target.value })} /></Field>
                  </>
                )}
                {has('category') && (
                  <Field label="Category">
                    <Select value={filters.category || ''} onChange={(e) => set({ category: e.target.value })}>
                      <option value="">All categories</option>
                      {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </Select>
                  </Field>
                )}
                {has('item') && (
                  <Field label="Product">
                    <Select value={filters.item || ''} onChange={(e) => set({ item: e.target.value })}>
                      <option value="">All products</option>
                      {items.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
                    </Select>
                  </Field>
                )}
                {has('supplier') && (
                  <Field label="Supplier">
                    <Select value={filters.supplier || ''} onChange={(e) => set({ supplier: e.target.value })}>
                      <option value="">All suppliers</option>
                      {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </Select>
                  </Field>
                )}
                {has('status') && (
                  <Field label="Stock status">
                    <Select value={filters.status || ''} onChange={(e) => set({ status: e.target.value })}>
                      <option value="">All</option>
                      {Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Field>
                )}
                {has('movementType') && (
                  <Field label="Movement type">
                    <Select value={filters.movementType || ''} onChange={(e) => set({ movementType: e.target.value })}>
                      <option value="">All types</option>
                      {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Field>
                )}
                {has('poStatus') && (
                  <Field label="Order status">
                    <Select value={filters.poStatus || ''} onChange={(e) => set({ poStatus: e.target.value })}>
                      <option value="">All statuses</option>
                      {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Field>
                )}
                {has('withinDays') && (
                  <Field label="Expiring within (days)">
                    <Input type="number" min="1" max="365" value={filters.withinDays || ''} placeholder="30" onChange={(e) => set({ withinDays: e.target.value })} />
                  </Field>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button icon={Play} onClick={run} loading={running}>Run report</Button>
                <Button variant="secondary" icon={FileSpreadsheet} loading={downloading === 'csv'} disabled={!result} onClick={() => download('csv')}>Export CSV</Button>
                <Button variant="secondary" icon={FileText} loading={downloading === 'pdf'} disabled={!result} onClick={() => download('pdf')}>Export PDF</Button>
              </div>
            </Card>

            <DataState loading={running && !result} error={runError} onRetry={run}>
              {result && (
                <>
                  {result.summary?.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {result.summary.map((s) => (
                        <div key={s.label} className="card p-4">
                          <p className="text-xs text-slate-500">{s.label}</p>
                          <p className="mt-0.5 text-lg font-semibold text-slate-900">{s.type === 'currency' ? formatCurrency(s.value, currency) : formatNumber(s.value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.chart?.data?.length > 0 && (
                    <Card title="Chart">
                      {result.chart.type === 'pie' ? (
                        <DonutChart data={result.chart.data} nameKey={result.chart.xKey} valueKey={result.chart.series[0].key} currency={result.chart.series[0].key === 'count' ? undefined : currency} />
                      ) : (
                        <MonthlyBarChart data={result.chart.data} xKey={result.chart.xKey} currency={currency} series={result.chart.series.map((s) => ({ key: s.key, label: s.label }))} />
                      )}
                    </Card>
                  )}
                  <Card
                    title={`${result.rows.length} row(s)`}
                    subtitle={`Generated ${formatDateTime(result.generatedAt)}${result.truncated ? ' · limited to the first 5,000 rows' : ''}`}
                    actions={<Button size="sm" variant="ghost" icon={Download} onClick={() => download('csv')}>CSV</Button>}
                    bodyClassName="p-0"
                  >
                    {result.rows.length === 0 ? (
                      <EmptyState title="No records" message="No data matches the selected filters." />
                    ) : (
                      <DataTable
                        rows={result.rows.slice(0, 500)}
                        rowKey={(r) => r._id || JSON.stringify(r).slice(0, 120)}
                        columns={result.columns.map((c) => ({
                          key: c.key,
                          header: c.label,
                          align: ['number', 'currency'].includes(c.type) ? 'right' : undefined,
                          className: c.wide ? 'min-w-[22rem] text-xs' : 'whitespace-nowrap',
                          render: (row) => renderCell(row[c.key], c.type, currency),
                        }))}
                      />
                    )}
                    {result.rows.length > 500 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing first 500 rows. Export to see all {result.rows.length}.</p>}
                  </Card>
                </>
              )}
            </DataState>
          </div>
        </div>
      </DataState>
    </>
  );
}
