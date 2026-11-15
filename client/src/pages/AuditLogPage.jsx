import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { auditApi } from '../services/endpoints.js';
import { Badge, Card, PageHeader } from '../components/ui/Display.jsx';
import { Input, Select } from '../components/ui/Form.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { ROLE_LABELS } from '../context/AuthContext.jsx';
import { formatDateTime } from '../utils/format.js';

const ENTITIES = ['InventoryItem', 'StockMovement', 'PurchaseOrder', 'Supplier', 'Category', 'User', 'Hotel', 'Report'];
const ACTION_TONES = { create: 'green', delete: 'red', archive: 'red', deactivate: 'red', approve: 'green', cancel: 'red', update: 'blue', login: 'gray', logout: 'gray' };

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ entityType: '', from: '', to: '', page: 1 });
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const { data, loading, error, reload } = useApi(() => auditApi.list({ ...filters, limit: 25 }), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Audit log" description="Who did what and when, for every important operation." />
      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Select value={filters.entityType} onChange={(e) => set({ entityType: e.target.value })} aria-label="Entity">
            <option value="">All record types</option>
            {ENTITIES.map((e) => <option key={e}>{e}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" />
          <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To" />
        </div>
        <DataTable
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyProps={{ icon: ScrollText, title: 'No audit entries' }}
          columns={[
            { key: 'createdAt', header: 'When', render: (a) => <span className="whitespace-nowrap">{formatDateTime(a.createdAt)}</span> },
            { key: 'user', header: 'User', render: (a) => <div className="whitespace-nowrap"><p className="text-slate-800">{a.userName}</p><p className="text-xs text-slate-500">{ROLE_LABELS[a.userRole]}</p></div> },
            { key: 'action', header: 'Action', render: (a) => <Badge tone={ACTION_TONES[a.action.split('.')[1]] || 'gray'}>{a.action}</Badge> },
            { key: 'entityType', header: 'Record', render: (a) => <span className="text-xs">{a.entityType}</span> },
            { key: 'summary', header: 'Details', render: (a) => <span className="text-sm text-slate-600">{a.summary}</span> },
            { key: 'ip', header: 'IP', render: (a) => <span className="text-xs text-slate-400">{a.ip || '—'}</span> },
          ]}
        />
        <Pagination meta={data?.meta} onPage={(page) => set({ page })} />
      </Card>
    </>
  );
}
