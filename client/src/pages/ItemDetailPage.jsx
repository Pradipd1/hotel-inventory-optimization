import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Boxes, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { itemsApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Badge, Card, DataState, KeyValue, PageHeader, StatusBadge } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { ConfirmDialog } from '../components/ui/Modal.jsx';
import { ItemFormModal } from '../components/inventory/ItemFormModal.jsx';
import { RecordMovementModal } from '../components/inventory/RecordMovementModal.jsx';
import { ForecastPanel } from '../components/optimization/ForecastPanel.jsx';
import { EXPIRY_STATUS, MOVEMENT_TYPES, STOCK_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate, formatDateTime, formatQty } from '../utils/format.js';

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManagement, currency } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [version, setVersion] = useState(0);

  const item = useApi(() => itemsApi.get(id), [id, version]);
  const history = useApi(() => itemsApi.history(id, { page, limit: 10 }), [id, page, version]);
  const i = item.data?.data;
  const refresh = () => setVersion((v) => v + 1);

  const remove = async () => {
    try {
      const res = await itemsApi.remove(id);
      toast.success(res.message);
      navigate('/inventory');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns = [
    { key: 'occurredAt', header: 'Date', render: (m) => <span className="whitespace-nowrap">{formatDateTime(m.occurredAt)}</span> },
    { key: 'type', header: 'Type', render: (m) => <StatusBadge map={MOVEMENT_TYPES} value={m.type} /> },
    { key: 'change', header: 'Change', align: 'right', render: (m) => (m.type === 'transfer' ? `${formatQty(m.quantity)} → ${m.toLocation}` : <span className={m.change > 0 ? 'text-emerald-600' : ''}>{m.change > 0 ? '+' : ''}{formatQty(m.change)}</span>) },
    { key: 'balanceAfter', header: 'Balance', align: 'right', render: (m) => formatQty(m.balanceAfter) },
    { key: 'referenceNo', header: 'Reference', render: (m) => <span className="whitespace-nowrap text-xs">{m.referenceNo}</span> },
    { key: 'reason', header: 'Reason', render: (m) => <span className="line-clamp-1 max-w-xs text-xs text-slate-500">{m.reason || m.department || '—'}</span> },
    { key: 'performedByName', header: 'By', render: (m) => <span className="whitespace-nowrap">{m.performedByName}</span> },
  ];

  return (
    <>
      <DataState loading={item.loading && !i} error={item.error} onRetry={item.reload}>
        {i && (
          <>
            <PageHeader
              title={i.name}
              description={`${i.sku} · ${i.category?.name}`}
              actions={
                <>
                  <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setMoveOpen(true)}>Record movement</Button>
                  {isManagement && <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>}
                  {isManagement && <Button variant="danger" icon={Trash2} onClick={() => setDeleteOpen(true)}>Delete</Button>}
                </>
              }
            >
              <Link to="/inventory" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Inventory</Link>
            </PageHeader>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <div className="flex items-start gap-4">
                  {i.image ? (
                    <img src={i.image} alt={i.name} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100"><Boxes className="h-8 w-8 text-slate-400" /></div>
                  )}
                  <div>
                    <p className="text-3xl font-semibold text-slate-900">{formatQty(i.currentStock)}</p>
                    <p className="text-sm text-slate-500">{i.unit} in stock</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusBadge map={STOCK_STATUS} value={i.stockStatus} />
                      {i.expiryStatus && i.expiryStatus !== 'ok' && <StatusBadge map={EXPIRY_STATUS} value={i.expiryStatus} />}
                    </div>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <KeyValue label="Minimum">{formatQty(i.minStock, i.unit)}</KeyValue>
                  <KeyValue label="Reorder point">{formatQty(i.reorderPoint, i.unit)}</KeyValue>
                  <KeyValue label="Maximum">{i.maxStock ? formatQty(i.maxStock, i.unit) : 'Not set'}</KeyValue>
                  <KeyValue label="Unit cost">{formatCurrency(i.unitCost, currency)}</KeyValue>
                  <KeyValue label="Stock value">{formatCurrency(i.stockValue, currency)}</KeyValue>
                  <KeyValue label="Location">{i.location}</KeyValue>
                  <KeyValue label="Expiry date">{i.expiryDate ? `${formatDate(i.expiryDate)} (${i.daysToExpiry >= 0 ? `${i.daysToExpiry} days` : 'expired'})` : 'Not perishable'}</KeyValue>
                  <KeyValue label="Supplier">{i.supplier ? (isManagement ? <Link className="text-brand-700 hover:underline" to={`/suppliers/${i.supplier._id}`}>{i.supplier.name}</Link> : i.supplier.name) : 'Not assigned'}</KeyValue>
                  <KeyValue label="Lead time">{i.leadTimeDays != null ? `${i.leadTimeDays} days (item)` : i.supplier?.leadTimeDays != null ? `${i.supplier.leadTimeDays} days (supplier)` : 'Not set'}</KeyValue>
                  <KeyValue label="Safety stock">{i.safetyStock != null ? formatQty(i.safetyStock, i.unit) : 'Not set'}</KeyValue>
                  <KeyValue label="Created">{formatDate(i.createdAt)}{i.createdBy?.name ? ` by ${i.createdBy.name}` : ''}</KeyValue>
                  <KeyValue label="Last updated">{formatDateTime(i.updatedAt)}</KeyValue>
                </dl>
                {i.description && <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">{i.description}</p>}
              </Card>

              <div className="space-y-6 lg:col-span-2">
                {isManagement ? (
                  <ForecastPanel itemId={id} version={version} onApplied={refresh} />
                ) : (
                  <Card title="Forecast"><Badge>Demand forecasts are available to inventory managers.</Badge></Card>
                )}
              </div>
            </div>

            <Card title="Stock history" subtitle="Every movement with balance after the change" className="mt-6" bodyClassName="p-0">
              <DataTable columns={columns} rows={history.data?.data} loading={history.loading} error={history.error} onRetry={history.reload} emptyProps={{ title: 'No movements recorded yet' }} />
              <Pagination meta={history.data?.meta} onPage={setPage} />
            </Card>

            <ItemFormModal open={editOpen} item={i} onClose={() => setEditOpen(false)} onSaved={refresh} />
            <RecordMovementModal open={moveOpen} item={i} onClose={() => setMoveOpen(false)} onSaved={refresh} />
            <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={remove} title={`Delete ${i.name}?`} message="The item is removed from lists; its history is kept for reports." confirmLabel="Delete item" />
          </>
        )}
      </DataState>
    </>
  );
}
