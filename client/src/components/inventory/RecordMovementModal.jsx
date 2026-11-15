import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../ui/Form.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useItemOptions } from '../../hooks/useLookups.js';
import { movementsApi } from '../../services/endpoints.js';
import { errorMessage, fieldErrors } from '../../services/api.js';
import { DEPARTMENTS, MOVEMENT_TYPES } from '../../utils/constants.js';
import { formatQty } from '../../utils/format.js';

const TYPE_HELP = {
  stock_in: 'New stock received outside a purchase order (e.g. local market purchase). Use Purchase Orders → Receive for supplier deliveries.',
  stock_out: 'Stock issued/consumed by a department. This is the demand used for forecasting.',
  adjustment: 'Correct the system quantity after a physical count.',
  return: 'Increase: items returned to the store. Decrease: items returned to a supplier.',
  transfer: 'Move stock to another storage location. Moving all stock changes the item location.',
  wastage: 'Expired, spoiled or damaged stock written off. Not counted as demand.',
};

/** Records any stock movement. Staff can only record consumption (also enforced by the API). */
export function RecordMovementModal({ open, onClose, item: fixedItem, defaultType = 'stock_out', onSaved }) {
  const { isManagement, user } = useAuth();
  const toast = useToast();
  const { items } = useItemOptions({ enabled: open && !fixedItem });
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm();

  const types = isManagement ? Object.keys(MOVEMENT_TYPES) : ['stock_out'];

  useEffect(() => {
    if (open) {
      reset({
        itemId: fixedItem?._id || '',
        type: types.includes(defaultType) ? defaultType : 'stock_out',
        quantity: '',
        direction: 'decrease',
        department: user?.department && DEPARTMENTS.includes(user.department) ? user.department : '',
        reason: '',
        toLocation: '',
        referenceNo: '',
        occurredAt: '',
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const type = watch('type');
  const itemId = watch('itemId');
  const qty = Number(watch('quantity')) || 0;
  const direction = watch('direction');
  const selected = fixedItem || items.find((i) => i._id === itemId);

  const delta = useMemo(() => {
    if (type === 'stock_in') return qty;
    if (type === 'stock_out' || type === 'wastage') return -qty;
    if (type === 'adjustment' || type === 'return') return direction === 'increase' ? qty : -qty;
    return 0;
  }, [type, qty, direction]);
  const after = selected ? selected.currentStock + delta : null;
  const insufficient = selected && (after < 0 || (type === 'transfer' && qty > selected.currentStock));

  const submit = async (values) => {
    const body = {
      itemId: values.itemId,
      type: values.type,
      quantity: Number(values.quantity),
      reason: values.reason || undefined,
      referenceNo: values.referenceNo || undefined,
      department: values.type === 'stock_out' ? values.department || undefined : undefined,
      direction: ['adjustment', 'return'].includes(values.type) ? values.direction : undefined,
      toLocation: values.type === 'transfer' ? values.toLocation : undefined,
      occurredAt: values.occurredAt ? new Date(values.occurredAt).toISOString() : undefined,
    };
    try {
      const res = await movementsApi.create(body);
      toast.success(res.message || 'Movement recorded');
      window.dispatchEvent(new Event('notifications:changed'));
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      Object.entries(fe).forEach(([field, message]) => setError(field, { message }));
      toast.error(errorMessage(err));
    }
  };

  const needsReason = ['adjustment', 'wastage', 'return'].includes(type);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record stock movement"
      description={selected ? `${selected.name} · current stock ${formatQty(selected.currentStock, selected.unit)}` : 'Every change creates a stock history record.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="movement-form" loading={isSubmitting} disabled={insufficient}>Save movement</Button>
        </>
      }
    >
      <form id="movement-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!fixedItem && (
          <Field label="Item" required error={errors.itemId?.message} className="sm:col-span-2">
            <Select {...register('itemId', { required: 'Select an item' })} error={errors.itemId}>
              <option value="">Select an item…</option>
              {items.map((i) => (
                <option key={i._id} value={i._id}>{i.name} ({i.sku}) · {formatQty(i.currentStock, i.unit)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Movement type" required className="sm:col-span-2" hint={TYPE_HELP[type]}>
          <Select {...register('type')} disabled={types.length === 1}>
            {types.map((t) => <option key={t} value={t}>{MOVEMENT_TYPES[t].label}</option>)}
          </Select>
        </Field>
        <Field label={`Quantity${selected ? ` (${selected.unit})` : ''}`} required error={errors.quantity?.message}>
          <Input
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            {...register('quantity', { required: 'Enter a quantity', validate: (v) => Number(v) > 0 || 'Must be greater than zero' })}
            error={errors.quantity}
          />
        </Field>
        {['adjustment', 'return'].includes(type) && (
          <Field label="Direction" required>
            <Select {...register('direction')}>
              <option value="decrease">Decrease stock</option>
              <option value="increase">Increase stock</option>
            </Select>
          </Field>
        )}
        {type === 'stock_out' && (
          <Field label="Department">
            <Select {...register('department')}>
              <option value="">Not specified</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
        )}
        {type === 'transfer' && (
          <Field label="Destination location" required error={errors.toLocation?.message}>
            <Input {...register('toLocation', { required: type === 'transfer' && 'Enter a destination' })} placeholder="e.g. Floor 3 Pantry" error={errors.toLocation} />
          </Field>
        )}
        <Field label="Reference no." hint="Optional. Generated automatically if empty.">
          <Input {...register('referenceNo')} maxLength={60} />
        </Field>
        <Field label="Date & time" hint="Leave empty for now">
          <Input type="datetime-local" max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} {...register('occurredAt')} />
        </Field>
        <Field label="Reason / description" required={needsReason} error={errors.reason?.message} className="sm:col-span-2">
          <Textarea {...register('reason', { required: needsReason && 'A reason is required for this movement type' })} maxLength={500} error={errors.reason} />
        </Field>
        {selected && qty > 0 && (
          <div className={`rounded-lg px-3 py-2 text-sm sm:col-span-2 ${insufficient ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
            {insufficient
              ? `Not enough stock: only ${formatQty(selected.currentStock, selected.unit)} available. Stock cannot go negative.`
              : type === 'transfer'
                ? `${formatQty(qty, selected.unit)} will move from ${selected.location} to the new location.`
                : `Stock after this movement: ${formatQty(after, selected.unit)}`}
          </div>
        )}
      </form>
    </Modal>
  );
}
