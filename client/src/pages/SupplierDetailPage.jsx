import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { suppliersApi } from '../services/endpoints.js';
import { Badge, Card, DataState, KeyValue, PageHeader, StatCard, StatusBadge } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DataTable } from '../components/ui/Table.jsx';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal.jsx';
import { PO_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate, formatQty } from '../utils/format.js';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const { data, loading, error, reload } = useApi(() => suppliersApi.get(id), [id]);
  const s = data?.data;

  return (
    <DataState loading={loading && !s} error={error} onRetry={reload}>
      {s && (
        <>
          <PageHeader
            title={s.name}
            description={s.companyName}
            actions={
              <>
                <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>
                <Button icon={ShoppingCart} disabled={s.status !== 'active'} onClick={() => navigate(`/purchase-orders/new?supplier=${s._id}`)}>New purchase order</Button>
              </>
            }
          >
            <Link to="/suppliers" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Suppliers</Link>
          </PageHeader>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total purchased" value={formatCurrency(s.stats.totalPurchased, currency)} />
            <StatCard label="Orders (excl. cancelled)" value={s.stats.totalOrders} tone="blue" />
            <StatCard label="Open orders" value={s.stats.openOrders} tone="amber" />
            <StatCard label="Products supplied" value={s.products.length} tone="green" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Details">
              <dl className="grid grid-cols-1 gap-4">
                <KeyValue label="Status"><Badge tone={s.status === 'active' ? 'green' : 'gray'}>{s.status}</Badge></KeyValue>
                <KeyValue label="Contact person">{s.contactPerson}</KeyValue>
                <KeyValue label="Email">{s.email ? <a href={`mailto:${s.email}`} className="text-brand-700 hover:underline">{s.email}</a> : null}</KeyValue>
                <KeyValue label="Phone">{s.phone}</KeyValue>
                <KeyValue label="Address">{s.address}</KeyValue>
                <KeyValue label="Payment terms">{s.paymentTerms}</KeyValue>
                <KeyValue label="Lead time">{s.leadTimeDays != null ? `${s.leadTimeDays} days` : 'Not set'}</KeyValue>
                {s.notes && <KeyValue label="Notes">{s.notes}</KeyValue>}
              </dl>
            </Card>
            <Card title="Supplied products" className="lg:col-span-2" bodyClassName="p-0">
              <DataTable
                rows={s.products}
                emptyProps={{ title: 'No items linked', message: 'Assign this supplier on an inventory item to link it.' }}
                onRowClick={(p) => navigate(`/inventory/${p._id}`)}
                columns={[
                  { key: 'name', header: 'Item', render: (p) => <span className="font-medium text-slate-900">{p.name}</span> },
                  { key: 'sku', header: 'SKU' },
                  { key: 'category', header: 'Category', render: (p) => p.category?.name },
                  { key: 'currentStock', header: 'Stock', align: 'right', render: (p) => formatQty(p.currentStock, p.unit) },
                  { key: 'unitCost', header: 'Unit cost', align: 'right', render: (p) => formatCurrency(p.unitCost, currency) },
                ]}
              />
            </Card>
          </div>

          <Card title="Purchase history" subtitle="Last 50 purchase orders" className="mt-6" bodyClassName="p-0">
            <DataTable
              rows={s.purchaseHistory}
              emptyProps={{ title: 'No purchase orders yet' }}
              onRowClick={(po) => navigate(`/purchase-orders/${po._id}`)}
              columns={[
                { key: 'poNumber', header: 'PO number', render: (po) => <span className="font-medium text-slate-900">{po.poNumber}</span> },
                { key: 'createdAt', header: 'Created', render: (po) => formatDate(po.createdAt) },
                { key: 'items', header: 'Items', render: (po) => <span className="line-clamp-1 text-xs text-slate-500">{po.items.map((i) => i.itemName).join(', ')}</span> },
                { key: 'total', header: 'Total', align: 'right', render: (po) => formatCurrency(po.total, currency) },
                { key: 'status', header: 'Status', render: (po) => <StatusBadge map={PO_STATUS} value={po.status} /> },
                { key: 'receivedAt', header: 'Received', render: (po) => formatDate(po.receivedAt) },
              ]}
            />
          </Card>
          <SupplierFormModal open={editOpen} supplier={s} onClose={() => setEditOpen(false)} onSaved={reload} />
        </>
      )}
    </DataState>
  );
}
