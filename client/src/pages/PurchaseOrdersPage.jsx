import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useSuppliers } from '../hooks/useLookups.js';
import { purchaseOrdersApi } from '../services/endpoints.js';
import { Badge, Card, PageHeader, StatusBadge, Tabs } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, SearchInput, Select } from '../components/ui/Form.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { PO_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const TAB_ORDER = ['', 'draft', 'pending_approval', 'approved', 'ordered', 'partially_received', 'received', 'cancelled'];

export default function PurchaseOrdersPage() {
  const { currency } = useAuth();
  const navigate = useNavigate();
  const { suppliers } = useSuppliers();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ status: params.get('status') || '', search: '', supplier: '', from: '', to: '', page: 1 });
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const { data, loading, error, reload } = useApi(() => purchaseOrdersApi.list({ ...filters, limit: 15 }), [JSON.stringify(filters)]);
  const counts = data?.meta?.statusCounts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  const columns = [
    { key: 'poNumber', header: 'PO number', render: (po) => (
      <div className="whitespace-nowrap">
        <p className="font-medium text-slate-900">{po.poNumber}</p>
        {po.source === 'optimization' && <Badge tone="purple" className="mt-0.5">From recommendations</Badge>}
      </div>
    ) },
    { key: 'supplier', header: 'Supplier', render: (po) => po.supplier?.name },
    { key: 'items', header: 'Items', render: (po) => <span className="line-clamp-1 max-w-xs text-xs text-slate-500">{po.items.map((i) => i.itemName).join(', ')}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (po) => <span className="font-medium">{formatCurrency(po.total, currency)}</span> },
    { key: 'status', header: 'Status', render: (po) => <StatusBadge map={PO_STATUS} value={po.status} /> },
    { key: 'createdAt', header: 'Created', render: (po) => <span className="whitespace-nowrap">{formatDate(po.createdAt)}</span> },
    { key: 'createdBy', header: 'Created by', render: (po) => <span className="whitespace-nowrap">{po.createdBy?.name}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Draft → approval → ordered → received. Receiving adds stock automatically."
        actions={<Button icon={Plus} onClick={() => navigate('/purchase-orders/new')}>New purchase order</Button>}
      />
      <Tabs
        value={filters.status}
        onChange={(status) => set({ status })}
        tabs={TAB_ORDER.map((s) => ({ value: s, label: s ? PO_STATUS[s].label : 'All', count: s ? counts[s] || 0 : all }))}
      />
      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={filters.search} onChange={(search) => set({ search })} placeholder="Search PO number" />
          <Select value={filters.supplier} onChange={(e) => set({ supplier: e.target.value })} aria-label="Supplier">
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="Created from" />
          <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="Created to" />
        </div>
        <DataTable
          columns={columns}
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(po) => navigate(`/purchase-orders/${po._id}`)}
          emptyProps={{ icon: ShoppingCart, title: 'No purchase orders', message: 'Create one manually or from the optimization recommendations.' }}
        />
        <Pagination meta={data?.meta} onPage={(page) => set({ page })} />
      </Card>
    </>
  );
}
