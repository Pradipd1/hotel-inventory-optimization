import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { suppliersApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Badge, Card, PageHeader } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { SearchInput, Select } from '../components/ui/Form.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { ConfirmDialog } from '../components/ui/Modal.jsx';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal.jsx';
import { formatCurrency } from '../utils/format.js';

export default function SuppliersPage() {
  const { currency } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const { data, loading, error, reload } = useApi(() => suppliersApi.list({ ...filters, limit: 15 }), [JSON.stringify(filters)]);

  const remove = async () => {
    try {
      const res = await suppliersApi.remove(deleting._id);
      toast.success(res.message);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(null);
    }
  };

  const columns = [
    { key: 'name', header: 'Supplier', render: (s) => (
      <div>
        <p className="font-medium text-slate-900">{s.name}</p>
        <p className="text-xs text-slate-500">{s.companyName}</p>
      </div>
    ) },
    { key: 'contact', header: 'Contact', render: (s) => (
      <div className="text-xs">
        <p className="text-slate-700">{s.contactPerson || '—'}</p>
        <p className="text-slate-500">{[s.phone, s.email].filter(Boolean).join(' · ')}</p>
      </div>
    ) },
    { key: 'paymentTerms', header: 'Payment terms', render: (s) => s.paymentTerms || '—' },
    { key: 'leadTimeDays', header: 'Lead time', align: 'right', render: (s) => (s.leadTimeDays != null ? `${s.leadTimeDays} days` : '—') },
    { key: 'productCount', header: 'Products', align: 'right' },
    { key: 'orderCount', header: 'Orders', align: 'right' },
    { key: 'totalPurchased', header: 'Total purchased', align: 'right', render: (s) => formatCurrency(s.totalPurchased, currency) },
    { key: 'status', header: 'Status', render: (s) => <Badge tone={s.status === 'active' ? 'green' : 'gray'}>{s.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (s) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} className="hover:text-red-600" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader title="Suppliers" description="Vendors, lead times and purchase history." actions={<Button icon={Plus} onClick={() => setEditing(null)}>Add supplier</Button>} />
      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput value={filters.search} onChange={(search) => setFilters({ ...filters, search, page: 1 })} placeholder="Search suppliers" className="sm:max-w-xs sm:flex-1" />
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} className="sm:w-44" aria-label="Status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} onRowClick={(s) => navigate(`/suppliers/${s._id}`)} emptyProps={{ icon: Truck, title: 'No suppliers found' }} />
        <Pagination meta={data?.meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>
      <SupplierFormModal open={editing !== undefined} supplier={editing || undefined} onClose={() => setEditing(undefined)} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting?.name}?`}
        message="Suppliers linked to items or purchase orders cannot be deleted. Set them to inactive instead to keep the purchase history."
        confirmLabel="Delete supplier"
      />
    </>
  );
}
