import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useCategories } from '../hooks/useLookups.js';
import { movementsApi } from '../services/endpoints.js';
import { Card, PageHeader, StatusBadge } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, SearchInput, Select } from '../components/ui/Form.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { RecordMovementModal } from '../components/inventory/RecordMovementModal.jsx';
import { MOVEMENT_TYPES } from '../utils/constants.js';
import { formatCurrency, formatDateTime, formatQty } from '../utils/format.js';

export default function MovementsPage() {
  const { currency, isManagement } = useAuth();
  const { categories } = useCategories();
  const [filters, setFilters] = useState({ search: '', type: '', category: '', from: '', to: '', page: 1 });
  const [open, setOpen] = useState(false);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const { data, loading, error, reload } = useApi(() => movementsApi.list({ ...filters, limit: 20 }), [JSON.stringify(filters)]);

  const columns = [
    { key: 'occurredAt', header: 'Date & time', render: (m) => <span className="whitespace-nowrap">{formatDateTime(m.occurredAt)}</span> },
    { key: 'referenceNo', header: 'Reference', render: (m) => (
      <div className="whitespace-nowrap">
        <p className="text-xs font-medium text-slate-700">{m.referenceNo}</p>
        {m.purchaseOrder && isManagement && <Link to={`/purchase-orders/${m.purchaseOrder._id}`} className="text-xs text-brand-700 hover:underline">{m.purchaseOrder.poNumber}</Link>}
      </div>
    ) },
    { key: 'itemName', header: 'Item', render: (m) => <Link to={`/inventory/${m.item}`} className="font-medium text-slate-900 hover:text-brand-700">{m.itemName}</Link> },
    { key: 'type', header: 'Type', render: (m) => <StatusBadge map={MOVEMENT_TYPES} value={m.type} /> },
    { key: 'change', header: 'Quantity', align: 'right', render: (m) => (
      m.type === 'transfer'
        ? <span className="text-xs">{formatQty(m.quantity, m.unit)} → {m.toLocation}</span>
        : <span className={`whitespace-nowrap font-medium ${m.change > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{m.change > 0 ? '+' : ''}{formatQty(m.change, m.unit)}</span>
    ) },
    { key: 'balance', header: 'Before → After', align: 'right', render: (m) => <span className="whitespace-nowrap text-xs text-slate-500">{formatQty(m.balanceBefore)} → <b className="text-slate-700">{formatQty(m.balanceAfter)}</b></span> },
    { key: 'totalValue', header: 'Value', align: 'right', render: (m) => formatCurrency(m.totalValue, currency) },
    { key: 'performedByName', header: 'By', render: (m) => <span className="whitespace-nowrap">{m.performedByName}</span> },
    { key: 'reason', header: 'Reason / dept.', render: (m) => <span className="line-clamp-2 max-w-[16rem] text-xs text-slate-500">{[m.department, m.reason].filter(Boolean).join(' · ') || '—'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Complete, append-only history of every stock change."
        actions={<Button icon={Plus} onClick={() => setOpen(true)}>{isManagement ? 'Record movement' : 'Record consumption'}</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={filters.search} onChange={(search) => set({ search })} placeholder="Item, SKU, reference, reason" className="lg:col-span-1" />
          <Select value={filters.type} onChange={(e) => set({ type: e.target.value })} aria-label="Movement type">
            <option value="">All types</option>
            {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" />
          <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To date" />
        </div>
        <DataTable
          columns={columns}
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyProps={{ icon: ArrowLeftRight, title: 'No movements match these filters' }}
        />
        <Pagination meta={data?.meta} onPage={(page) => set({ page })} />
      </Card>
      <RecordMovementModal open={open} onClose={() => setOpen(false)} onSaved={reload} />
    </>
  );
}
