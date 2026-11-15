import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, PackageCheck, Pencil, Send, Truck, Undo2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { purchaseOrdersApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Badge, Card, DataState, KeyValue, PageHeader, StatusBadge } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConfirmDialog } from '../components/ui/Modal.jsx';
import { ReceiveModal } from '../components/purchasing/ReceiveModal.jsx';
import { PO_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate, formatDateTime, formatQty } from '../utils/format.js';

const ACTIONS = {
  submit: { label: 'Submit for approval', icon: Send, variant: 'primary', title: 'Submit for approval?', message: 'An administrator will be notified to review this order.' },
  approve: { label: 'Approve', icon: CheckCircle2, variant: 'success', title: 'Approve purchase order?', message: 'The order can then be placed with the supplier.', note: true },
  reject: { label: 'Reject', icon: Undo2, variant: 'danger', title: 'Return to draft?', message: 'The order goes back to draft so it can be corrected. Add a reason for the requester.', note: true },
  order: { label: 'Mark as ordered', icon: Truck, variant: 'primary', title: 'Mark as ordered?', message: 'Confirm the order has been placed with the supplier. Goods can then be received.' },
  cancel: { label: 'Cancel order', icon: Ban, variant: 'danger', title: 'Cancel this purchase order?', message: 'Cancelled orders cannot be reopened.', note: true },
};

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, currency } = useAuth();
  const toast = useToast();
  const [action, setAction] = useState(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const { data, loading, error, reload } = useApi(() => purchaseOrdersApi.get(id), [id]);
  const po = data?.data;

  const run = async (note) => {
    try {
      const res = await purchaseOrdersApi.action(id, action, note || undefined);
      toast.success(res.message);
      window.dispatchEvent(new Event('notifications:changed'));
      setAction(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
      setAction(null);
    }
  };

  const available = [];
  if (po) {
    if (po.status === 'draft') available.push('submit');
    if (po.status === 'pending_approval' && isAdmin) available.push('approve', 'reject');
    if (po.status === 'approved') available.push('order');
    if (['draft', 'pending_approval', 'approved', 'ordered'].includes(po.status) && !po.items.some((l) => l.receivedQuantity > 0)) available.push('cancel');
  }
  const canReceive = po && ['ordered', 'partially_received'].includes(po.status);
  const a = action && ACTIONS[action];

  return (
    <DataState loading={loading && !po} error={error} onRetry={reload}>
      {po && (
        <>
          <PageHeader
            title={po.poNumber}
            description={`${po.supplier?.name} · created ${formatDate(po.createdAt)} by ${po.createdBy?.name}`}
            actions={
              <>
                {po.status === 'draft' && <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/purchase-orders/${id}/edit`)}>Edit</Button>}
                {available.map((k) => (
                  <Button key={k} variant={k === 'cancel' ? 'secondary' : ACTIONS[k].variant} icon={ACTIONS[k].icon} onClick={() => setAction(k)}>{ACTIONS[k].label}</Button>
                ))}
                {canReceive && <Button variant="success" icon={PackageCheck} onClick={() => setReceiveOpen(true)}>Receive goods</Button>}
              </>
            }
          >
            <Link to="/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Purchase orders</Link>
            <div className="mb-1 flex flex-wrap gap-2">
              <StatusBadge map={PO_STATUS} value={po.status} />
              {po.source === 'optimization' && <Badge tone="purple">Generated from recommendations</Badge>}
            </div>
          </PageHeader>

          {po.status === 'pending_approval' && !isAdmin && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Waiting for an administrator to approve this order.</div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Order lines" className="lg:col-span-2" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr>
                      <th className="th">Item</th>
                      <th className="th text-right">Quantity</th>
                      <th className="th text-right">Received</th>
                      <th className="th text-right">Unit price</th>
                      <th className="th text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {po.items.map((l) => (
                      <tr key={l._id}>
                        <td className="td"><Link to={`/inventory/${l.item}`} className="font-medium text-slate-900 hover:text-brand-700">{l.itemName}</Link><p className="text-xs text-slate-500">{l.sku}</p></td>
                        <td className="td text-right">{formatQty(l.quantity, l.unit)}</td>
                        <td className="td text-right">
                          <span className={l.receivedQuantity >= l.quantity ? 'text-emerald-600' : l.receivedQuantity > 0 ? 'text-amber-600' : 'text-slate-400'}>{formatQty(l.receivedQuantity)}</span>
                        </td>
                        <td className="td text-right">{formatCurrency(l.unitPrice, currency)}</td>
                        <td className="td text-right font-medium">{formatCurrency(l.lineTotal, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-sm">
                    <tr><td colSpan={4} className="px-4 py-2 text-right text-slate-500">Subtotal</td><td className="px-4 py-2 text-right tabular-nums">{formatCurrency(po.subtotal, currency)}</td></tr>
                    <tr><td colSpan={4} className="px-4 py-2 text-right text-slate-500">Tax ({po.taxRate}%)</td><td className="px-4 py-2 text-right tabular-nums">{formatCurrency(po.taxAmount, currency)}</td></tr>
                    <tr><td colSpan={4} className="px-4 py-2 text-right font-semibold text-slate-900">Total</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(po.total, currency)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <div className="space-y-6">
              <Card title="Details">
                <dl className="grid gap-4">
                  <KeyValue label="Supplier">{po.supplier && <Link to={`/suppliers/${po.supplier._id}`} className="text-brand-700 hover:underline">{po.supplier.name}</Link>}</KeyValue>
                  <KeyValue label="Contact">{[po.supplier?.contactPerson, po.supplier?.phone].filter(Boolean).join(' · ') || null}</KeyValue>
                  <KeyValue label="Payment terms">{po.supplier?.paymentTerms}</KeyValue>
                  <KeyValue label="Expected delivery">{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : null}</KeyValue>
                  <KeyValue label="Approved by">{po.approvedBy ? `${po.approvedBy.name}, ${formatDateTime(po.approvedAt)}` : null}</KeyValue>
                  {po.notes && <KeyValue label="Notes">{po.notes}</KeyValue>}
                </dl>
              </Card>
              <Card title="Status history">
                <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                  {po.statusHistory.map((h, i) => (
                    <li key={i}>
                      <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-brand-700" />
                      <StatusBadge map={PO_STATUS} value={h.status} />
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(h.at)} · {h.byName}</p>
                      {h.note && <p className="mt-0.5 text-xs text-slate-600">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>

          {po.receipts.length > 0 && (
            <Card title="Goods received" className="mt-6" bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {po.receipts.map((r) => (
                  <li key={r._id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{r.receiptNo}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(r.receivedAt)} · {r.receivedByName}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{r.lines.map((l) => `${l.itemName}: ${formatQty(l.quantity)}`).join(' · ')}</p>
                    {r.notes && <p className="mt-0.5 text-xs text-slate-500">{r.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <ConfirmDialog
            open={Boolean(action)}
            onClose={() => setAction(null)}
            onConfirm={run}
            title={a?.title}
            message={a?.message}
            confirmLabel={a?.label}
            variant={a?.variant === 'success' ? 'success' : a?.variant === 'danger' ? 'danger' : 'primary'}
            withNote={a?.note}
          />
          <ReceiveModal open={receiveOpen} po={po} onClose={() => setReceiveOpen(false)} onReceived={reload} />
        </>
      )}
    </DataState>
  );
}
