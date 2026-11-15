import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useCategories } from '../hooks/useLookups.js';
import { itemsApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Card, PageHeader, StatusBadge } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { SearchInput, Select } from '../components/ui/Form.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { ConfirmDialog } from '../components/ui/Modal.jsx';
import { ItemFormModal } from '../components/inventory/ItemFormModal.jsx';
import { RecordMovementModal } from '../components/inventory/RecordMovementModal.jsx';
import { EXPIRY_STATUS, STOCK_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate, formatQty } from '../utils/format.js';

export default function InventoryPage() {
  const { isManagement, currency } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { categories } = useCategories();

  const query = {
    search: params.get('search') || '',
    category: params.get('category') || '',
    status: params.get('status') || '',
    sort: params.get('sort') || 'name',
    order: params.get('order') || 'asc',
    page: Number(params.get('page')) || 1,
    limit: 15,
  };
  const setQuery = (patch) => {
    const next = { ...query, ...patch };
    if (!('page' in patch)) next.page = 1;
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && k !== 'limit' && !(k === 'page' && v === 1) && p.set(k, v));
    setParams(p, { replace: true });
  };

  const { data, loading, error, reload } = useApi(() => itemsApi.list(query), [params.toString()]);
  const [formItem, setFormItem] = useState(undefined); // undefined=closed, null=new, item=edit
  const [moveItem, setMoveItem] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (params.get('new') === '1' && isManagement) {
      setFormItem(null);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSort = (key) => setQuery({ sort: key, order: query.sort === key && query.order === 'asc' ? 'desc' : 'asc' });

  const remove = async () => {
    try {
      const res = await itemsApi.remove(deleting._id);
      toast.success(res.message);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Item',
      sortable: true,
      render: (i) => (
        <div className="flex items-center gap-3">
          {i.image ? (
            <img src={i.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-slate-200" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100"><Boxes className="h-4 w-4 text-slate-400" /></div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{i.name}</p>
            <p className="text-xs text-slate-500">{i.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (i) => <span className="whitespace-nowrap">{i.category?.name}</span> },
    { key: 'currentStock', header: 'Stock', sortable: true, align: 'right', render: (i) => <span className="font-medium whitespace-nowrap">{formatQty(i.currentStock, i.unit)}</span> },
    { key: 'reorderPoint', header: 'Reorder pt', align: 'right', render: (i) => formatQty(i.reorderPoint) },
    { key: 'unitCost', header: 'Unit cost', sortable: true, align: 'right', render: (i) => formatCurrency(i.unitCost, currency) },
    { key: 'stockValue', header: 'Value', align: 'right', render: (i) => formatCurrency(i.stockValue, currency) },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge map={STOCK_STATUS} value={i.stockStatus} />
          {i.expiryStatus && i.expiryStatus !== 'ok' && i.currentStock > 0 && <StatusBadge map={EXPIRY_STATUS} value={i.expiryStatus} />}
        </div>
      ),
    },
    { key: 'expiryDate', header: 'Expiry', sortable: true, render: (i) => <span className="whitespace-nowrap">{formatDate(i.expiryDate)}</span> },
    { key: 'location', header: 'Location', render: (i) => <span className="whitespace-nowrap">{i.location}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (i) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" title="Record movement" aria-label={`Record movement for ${i.name}`} onClick={() => setMoveItem(i)}><ArrowLeftRight className="h-4 w-4" /></Button>
          {isManagement && <Button size="icon" variant="ghost" title="Edit" aria-label={`Edit ${i.name}`} onClick={() => setFormItem(i)}><Pencil className="h-4 w-4" /></Button>}
          {isManagement && <Button size="icon" variant="ghost" title="Delete" aria-label={`Delete ${i.name}`} className="hover:text-red-600" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="All stock items with live status. Click an item for its history and forecast."
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setMoveItem(false)}>Record movement</Button>
            {isManagement && <Button icon={Plus} onClick={() => setFormItem(null)}>Add item</Button>}
          </>
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <SearchInput value={query.search} onChange={(search) => setQuery({ search })} placeholder="Search name, SKU or location" className="md:max-w-xs md:flex-1" />
          <Select value={query.category} onChange={(e) => setQuery({ category: e.target.value })} className="md:w-52" aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          <Select value={query.status} onChange={(e) => setQuery({ status: e.target.value })} className="md:w-48" aria-label="Filter by status">
            <option value="">All statuses</option>
            {Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          {(query.search || query.category || query.status) && (
            <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          sort={{ key: query.sort, order: query.order }}
          onSort={onSort}
          onRowClick={(i) => navigate(`/inventory/${i._id}`)}
          emptyProps={{ icon: Boxes, title: 'No items found', message: query.search || query.status || query.category ? 'Try changing the filters.' : 'Add your first inventory item to get started.' }}
        />
        <Pagination meta={data?.meta} onPage={(page) => setQuery({ page })} />
      </Card>

      <ItemFormModal open={formItem !== undefined} item={formItem || undefined} onClose={() => setFormItem(undefined)} onSaved={reload} />
      <RecordMovementModal open={moveItem !== null} item={moveItem || undefined} onClose={() => setMoveItem(null)} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting?.name}?`}
        message="The item will be removed from inventory lists. Its stock history, consumption and purchase records are kept for reporting. Items on open purchase orders cannot be deleted."
        confirmLabel="Delete item"
      />
    </>
  );
}
