import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useItemOptions, useSuppliers } from '../hooks/useLookups.js';
import { purchaseOrdersApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Card, LoadingState, PageHeader } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/Form.jsx';
import { formatCurrency, formatQty, toDateInput } from '../utils/format.js';

const emptyLine = () => ({ key: Math.random().toString(36).slice(2), item: '', quantity: '', unitPrice: '' });

export default function PurchaseOrderFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, currency } = useAuth();
  const { suppliers } = useSuppliers({ activeOnly: true });
  const { items } = useItemOptions();
  const itemById = useMemo(() => new Map(items.map((i) => [i._id, i])), [items]);

  const [supplier, setSupplier] = useState(params.get('supplier') || '');
  const [lines, setLines] = useState([emptyLine()]);
  const [taxRate, setTaxRate] = useState(user?.hotel?.settings?.defaultTaxRate ?? 0);
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    purchaseOrdersApi.get(id).then((res) => {
      const po = res.data;
      if (po.status !== 'draft') {
        toast.warning('Only draft purchase orders can be edited');
        navigate(`/purchase-orders/${id}`, { replace: true });
        return;
      }
      setSupplier(po.supplier._id);
      setLines(po.items.map((l) => ({ key: l._id, item: String(l.item), quantity: l.quantity, unitPrice: l.unitPrice })));
      setTaxRate(po.taxRate);
      setExpected(toDateInput(po.expectedDeliveryDate));
      setNotes(po.notes || '');
      setLoading(false);
    }).catch((err) => {
      toast.error(errorMessage(err));
      navigate('/purchase-orders');
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items supplied by the selected supplier are listed first.
  const sortedItems = useMemo(() => {
    const mine = items.filter((i) => i.supplier?._id === supplier);
    const others = items.filter((i) => i.supplier?._id !== supplier);
    return { mine, others };
  }, [items, supplier]);

  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const chooseItem = (key, itemId) => {
    const it = itemById.get(itemId);
    updateLine(key, { item: itemId, unitPrice: it ? it.unitCost : '' });
  };

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const tax = (subtotal * (Number(taxRate) || 0)) / 100;

  const validate = () => {
    const e = {};
    if (!supplier) e.supplier = 'Select a supplier';
    const used = new Set();
    lines.forEach((l) => {
      if (!l.item) e[`${l.key}.item`] = 'Select an item';
      else if (used.has(l.item)) e[`${l.key}.item`] = 'Item already added';
      used.add(l.item);
      if (!(Number(l.quantity) > 0)) e[`${l.key}.quantity`] = 'Enter a quantity';
      if (l.unitPrice === '' || Number(l.unitPrice) < 0) e[`${l.key}.unitPrice`] = 'Invalid price';
    });
    if (Number(taxRate) < 0 || Number(taxRate) > 100) e.taxRate = '0–100';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (submit) => {
    if (!validate()) return;
    setSaving(submit ? 'submit' : 'draft');
    const body = {
      supplier,
      items: lines.map((l) => ({ item: l.item, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      taxRate: Number(taxRate) || 0,
      notes,
      expectedDeliveryDate: expected || null,
    };
    try {
      const res = isEdit ? await purchaseOrdersApi.update(id, body) : await purchaseOrdersApi.create(body);
      const poId = res.data._id;
      if (submit) {
        await purchaseOrdersApi.action(poId, 'submit');
        toast.success(`${res.data.poNumber} submitted for approval`);
      } else {
        toast.success(res.message);
      }
      navigate(`/purchase-orders/${poId}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit purchase order' : 'New purchase order'}
        description="Totals are recalculated by the server when saved."
        actions={
          <>
            <Button variant="secondary" icon={Save} loading={saving === 'draft'} disabled={Boolean(saving)} onClick={() => save(false)}>Save draft</Button>
            <Button icon={Send} loading={saving === 'submit'} disabled={Boolean(saving)} onClick={() => save(true)}>Save & submit for approval</Button>
          </>
        }
      >
        <Link to="/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Purchase orders</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Order details" className="lg:col-span-1">
          <div className="space-y-4">
            <Field label="Supplier" required error={errors.supplier}>
              <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} error={errors.supplier}>
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}{s.leadTimeDays != null ? ` (${s.leadTimeDays}-day lead time)` : ''}</option>)}
              </Select>
            </Field>
            <Field label="Expected delivery date">
              <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} min={toDateInput(new Date())} />
            </Field>
            <Field label="Tax rate (%)" error={errors.taxRate}>
              <Input type="number" min="0" max="100" step="any" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} error={errors.taxRate} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
          </div>
        </Card>

        <Card title="Items" className="lg:col-span-2" actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setLines((l) => [...l, emptyLine()])}>Add line</Button>}>
          <div className="space-y-3">
            {lines.map((l, idx) => {
              const it = itemById.get(l.item);
              const total = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
              return (
                <div key={l.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
                  <Field label={idx === 0 ? 'Item' : undefined} error={errors[`${l.key}.item`]} className="sm:col-span-5">
                    <Select value={l.item} onChange={(e) => chooseItem(l.key, e.target.value)} error={errors[`${l.key}.item`]} aria-label="Item">
                      <option value="">Select item…</option>
                      {sortedItems.mine.length > 0 && (
                        <optgroup label="Supplied by this supplier">
                          {sortedItems.mine.map((i) => <option key={i._id} value={i._id}>{i.name} ({i.sku})</option>)}
                        </optgroup>
                      )}
                      <optgroup label={sortedItems.mine.length ? 'Other items' : 'Items'}>
                        {sortedItems.others.map((i) => <option key={i._id} value={i._id}>{i.name} ({i.sku})</option>)}
                      </optgroup>
                    </Select>
                    {it && <p className="mt-1 text-xs text-slate-500">In stock {formatQty(it.currentStock, it.unit)} · reorder at {formatQty(it.reorderPoint)}{it.maxStock ? ` · max ${formatQty(it.maxStock)}` : ''}</p>}
                  </Field>
                  <Field label={idx === 0 ? `Quantity` : undefined} error={errors[`${l.key}.quantity`]} className="sm:col-span-2">
                    <Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} error={errors[`${l.key}.quantity`]} aria-label="Quantity" />
                  </Field>
                  <Field label={idx === 0 ? 'Unit price' : undefined} error={errors[`${l.key}.unitPrice`]} className="sm:col-span-2">
                    <Input type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} error={errors[`${l.key}.unitPrice`]} aria-label="Unit price" />
                  </Field>
                  <div className={`flex items-center justify-between gap-2 sm:col-span-3 ${idx === 0 ? 'sm:pt-6' : ''}`}>
                    <span className="text-sm font-medium text-slate-800 tabular-nums">{formatCurrency(total, currency)}</span>
                    <Button size="icon" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <dl className="mt-5 ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{formatCurrency(subtotal, currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Tax ({Number(taxRate) || 0}%)</dt><dd className="tabular-nums">{formatCurrency(tax, currency)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(subtotal + tax, currency)}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
