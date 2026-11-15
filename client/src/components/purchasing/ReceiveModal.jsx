import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input, Textarea } from '../ui/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { purchaseOrdersApi } from '../../services/endpoints.js';
import { errorMessage } from '../../services/api.js';
import { formatQty } from '../../utils/format.js';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Records goods received. A unique idempotency key is generated when the dialog opens, so a
 * double-click or network retry of the same submission can never add stock twice.
 */
export function ReceiveModal({ open, onClose, po, onReceived }) {
  const toast = useToast();
  const [qty, setQty] = useState({});
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && po) {
      setQty(Object.fromEntries(po.items.map((l) => [l._id, Math.max(0, l.quantity - l.receivedQuantity)])));
      setNotes('');
      setKey(newKey());
    }
  }, [open, po]);

  if (!po) return null;
  const invalid = po.items.some((l) => {
    const v = Number(qty[l._id]);
    return Number.isNaN(v) || v < 0 || v > l.quantity - l.receivedQuantity + 1e-9;
  });
  const anything = po.items.some((l) => Number(qty[l._id]) > 0);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await purchaseOrdersApi.receive(po._id, {
        idempotencyKey: key,
        notes,
        lines: po.items.map((l) => ({ lineId: l._id, quantity: Number(qty[l._id]) || 0 })),
      });
      toast.success(res.message);
      window.dispatchEvent(new Event('notifications:changed'));
      onReceived?.(res.data);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      size="lg"
      title={`Receive goods · ${po.poNumber}`}
      description="Enter the quantities delivered. Stock and stock history update immediately."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="success" onClick={submit} loading={busy} disabled={invalid || !anything}>Confirm receipt</Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="th">Item</th>
              <th className="th text-right">Ordered</th>
              <th className="th text-right">Received</th>
              <th className="th text-right">Outstanding</th>
              <th className="th text-right">Receiving now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.items.map((l) => {
              const remaining = Math.max(0, l.quantity - l.receivedQuantity);
              const v = Number(qty[l._id]);
              const bad = Number.isNaN(v) || v < 0 || v > remaining + 1e-9;
              return (
                <tr key={l._id}>
                  <td className="td font-medium text-slate-900">{l.itemName}<p className="text-xs font-normal text-slate-500">{l.sku}</p></td>
                  <td className="td text-right">{formatQty(l.quantity, l.unit)}</td>
                  <td className="td text-right">{formatQty(l.receivedQuantity, l.unit)}</td>
                  <td className="td text-right">{formatQty(remaining, l.unit)}</td>
                  <td className="td w-36 text-right">
                    <Input
                      type="number"
                      min="0"
                      max={remaining}
                      step="any"
                      value={qty[l._id] ?? ''}
                      disabled={remaining === 0}
                      onChange={(e) => setQty((q) => ({ ...q, [l._id]: e.target.value }))}
                      error={bad}
                      className="text-right"
                      aria-label={`Quantity received for ${l.itemName}`}
                    />
                    {bad && <p className="mt-1 text-xs text-red-600">Max {formatQty(remaining)}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Textarea className="mt-4" placeholder="Delivery notes (optional): invoice number, condition of goods…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
    </Modal>
  );
}
