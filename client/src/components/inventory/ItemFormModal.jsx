import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ImagePlus } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select, Textarea, numberOrNull } from '../ui/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useCategories, useSuppliers } from '../../hooks/useLookups.js';
import { itemsApi } from '../../services/endpoints.js';
import { errorMessage, fieldErrors } from '../../services/api.js';
import { UNITS } from '../../utils/constants.js';
import { toDateInput } from '../../utils/format.js';

const num = (v) => (v === '' || v == null ? 0 : Number(v));

function defaults(item) {
  return {
    name: item?.name || '',
    sku: item?.sku || '',
    category: item?.category?._id || item?.category || '',
    description: item?.description || '',
    unit: item?.unit || 'piece',
    unitCost: item?.unitCost ?? '',
    openingStock: '',
    minStock: item?.minStock ?? 0,
    maxStock: item?.maxStock ?? 0,
    reorderPoint: item?.reorderPoint ?? 0,
    supplier: item?.supplier?._id || item?.supplier || '',
    location: item?.location || 'Main Store',
    expiryDate: toDateInput(item?.expiryDate),
    leadTimeDays: item?.leadTimeDays ?? '',
    safetyStock: item?.safetyStock ?? '',
    orderingCost: item?.orderingCost ?? '',
    holdingCostPerUnit: item?.holdingCostPerUnit ?? '',
  };
}

export function ItemFormModal({ open, onClose, item, onSaved }) {
  const isEdit = Boolean(item);
  const toast = useToast();
  const { categories } = useCategories();
  const { suppliers } = useSuppliers({ enabled: open });
  const [image, setImage] = useState(null);
  const { register, handleSubmit, reset, setError, watch, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults(item) });

  useEffect(() => {
    if (open) {
      reset(defaults(item));
      setImage(null);
    }
  }, [open, item, reset]);

  const maxStock = num(watch('maxStock'));

  const submit = async (v) => {
    const body = {
      name: v.name,
      sku: v.sku,
      category: v.category,
      description: v.description,
      unit: v.unit,
      unitCost: num(v.unitCost),
      minStock: num(v.minStock),
      maxStock: num(v.maxStock),
      reorderPoint: num(v.reorderPoint),
      supplier: v.supplier || null,
      location: v.location,
      expiryDate: v.expiryDate || null,
      leadTimeDays: numberOrNull(v.leadTimeDays),
      safetyStock: numberOrNull(v.safetyStock),
      orderingCost: numberOrNull(v.orderingCost),
      holdingCostPerUnit: numberOrNull(v.holdingCostPerUnit),
    };
    if (!isEdit) body.openingStock = num(v.openingStock);
    try {
      const res = isEdit ? await itemsApi.update(item._id, body) : await itemsApi.create(body);
      if (image) {
        try {
          await itemsApi.uploadImage(res.data._id, image);
        } catch (err) {
          toast.warning(`Item saved, but the image upload failed: ${errorMessage(err)}`);
        }
      }
      toast.success(res.message);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      Object.entries(fieldErrors(err)).forEach(([f, m]) => setError(f, { message: m }));
      toast.error(errorMessage(err));
    }
  };

  const nonNegative = { validate: (x) => x === '' || Number(x) >= 0 || 'Cannot be negative' };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${item.name}` : 'Add inventory item'}
      description={isEdit ? 'Stock quantity changes only through stock movements.' : 'Opening stock is recorded as a Stock In movement.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="item-form" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Create item'}</Button>
        </>
      }
    >
      <form id="item-form" onSubmit={handleSubmit(submit)} noValidate className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" required error={errors.name?.message}>
            <Input {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} error={errors.name} />
          </Field>
          <Field label="SKU / product code" required error={errors.sku?.message} hint="Letters, numbers, - and _">
            <Input {...register('sku', { required: 'SKU is required', pattern: { value: /^[A-Za-z0-9_-]+$/, message: 'Letters, numbers, - and _ only' } })} className="uppercase" error={errors.sku} />
          </Field>
          <Field label="Category" required error={errors.category?.message}>
            <Select {...register('category', { required: 'Select a category' })} error={errors.category}>
              <option value="">Select…</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Unit of measurement" required>
            <Select {...register('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
          </Field>
          <Field label="Unit purchase cost" required error={errors.unitCost?.message}>
            <Input type="number" step="any" min="0" {...register('unitCost', { required: 'Unit cost is required', ...nonNegative })} error={errors.unitCost} />
          </Field>
          <Field label="Supplier">
            <Select {...register('supplier')}>
              <option value="">No supplier</option>
              {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}{s.status === 'inactive' ? ' (inactive)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Storage location">
            <Input {...register('location')} />
          </Field>
          <Field label="Expiry date" hint="Only for perishable items">
            <Input type="date" {...register('expiryDate')} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={2} {...register('description')} maxLength={1000} />
          </Field>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Stock levels</h4>
          <div className="grid gap-4 sm:grid-cols-4">
            {!isEdit && (
              <Field label="Opening stock" error={errors.openingStock?.message}>
                <Input type="number" step="any" min="0" {...register('openingStock', nonNegative)} error={errors.openingStock} />
              </Field>
            )}
            <Field label="Minimum stock" error={errors.minStock?.message}>
              <Input type="number" step="any" min="0" {...register('minStock', { ...nonNegative, validate: (x) => (maxStock > 0 && num(x) > maxStock ? 'Exceeds maximum' : Number(x) >= 0 || 'Cannot be negative') })} error={errors.minStock} />
            </Field>
            <Field label="Reorder point" error={errors.reorderPoint?.message} hint="Low-stock alert at or below">
              <Input type="number" step="any" min="0" {...register('reorderPoint', { validate: (x) => (maxStock > 0 && num(x) > maxStock ? 'Exceeds maximum' : Number(x) >= 0 || 'Cannot be negative') })} error={errors.reorderPoint} />
            </Field>
            <Field label="Maximum stock" error={errors.maxStock?.message} hint="0 = no maximum">
              <Input type="number" step="any" min="0" {...register('maxStock', nonNegative)} error={errors.maxStock} />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold text-slate-900">Optimization parameters</h4>
          <p className="mb-3 text-xs text-slate-500">Leave empty to use supplier lead time and hotel defaults. If no value is available, the engine reports that EOQ or the reorder point cannot be calculated.</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Lead time (days)" hint="Overrides supplier"><Input type="number" min="0" step="1" {...register('leadTimeDays', nonNegative)} /></Field>
            <Field label="Safety stock"><Input type="number" min="0" step="any" {...register('safetyStock', nonNegative)} /></Field>
            <Field label="Ordering cost (S)" hint="Per order"><Input type="number" min="0" step="any" {...register('orderingCost', nonNegative)} /></Field>
            <Field label="Holding cost (H)" hint="Per unit per year"><Input type="number" min="0" step="any" {...register('holdingCostPerUnit', nonNegative)} /></Field>
          </div>
        </section>

        <section>
          <label className="label">Product image (optional)</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
            <ImagePlus className="h-5 w-5 text-slate-400" />
            <span className="truncate">{image ? image.name : 'Choose a JPG, PNG or WebP (max 2 MB)'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 2 * 1024 * 1024) {
                  toast.error('Image is larger than 2 MB');
                  return;
                }
                setImage(f || null);
              }}
            />
          </label>
        </section>
      </form>
    </Modal>
  );
}
