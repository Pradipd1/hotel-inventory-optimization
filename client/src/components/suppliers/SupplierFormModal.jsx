import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select, Textarea, numberOrNull } from '../ui/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { suppliersApi } from '../../services/endpoints.js';
import { errorMessage, fieldErrors } from '../../services/api.js';

const FIELDS = ['name', 'companyName', 'contactPerson', 'email', 'phone', 'address', 'paymentTerms', 'notes'];

export function SupplierFormModal({ open, onClose, supplier, onSaved }) {
  const isEdit = Boolean(supplier);
  const toast = useToast();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (open) {
      const v = Object.fromEntries(FIELDS.map((f) => [f, supplier?.[f] || '']));
      reset({ ...v, leadTimeDays: supplier?.leadTimeDays ?? '', status: supplier?.status || 'active' });
    }
  }, [open, supplier, reset]);

  const submit = async (v) => {
    const body = { ...v, leadTimeDays: numberOrNull(v.leadTimeDays) };
    try {
      const res = isEdit ? await suppliersApi.update(supplier._id, body) : await suppliersApi.create(body);
      toast.success(res.message);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      Object.entries(fieldErrors(err)).forEach(([f, m]) => setError(f, { message: m }));
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${supplier.name}` : 'Add supplier'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="supplier-form" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Create supplier'}</Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit(submit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier name" required error={errors.name?.message}>
          <Input {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} error={errors.name} />
        </Field>
        <Field label="Company name"><Input {...register('companyName')} /></Field>
        <Field label="Contact person"><Input {...register('contactPerson')} /></Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register('email', { pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} error={errors.email} />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input {...register('phone', { pattern: { value: /^[0-9+()\-\s]*$/, message: 'Digits, spaces, +, - and brackets only' } })} error={errors.phone} />
        </Field>
        <Field label="Payment terms"><Input {...register('paymentTerms')} placeholder="e.g. Net 30" /></Field>
        <Field label="Lead time (days)" hint="Used for reorder point calculation" error={errors.leadTimeDays?.message}>
          <Input type="number" min="0" step="1" {...register('leadTimeDays', { validate: (x) => x === '' || Number(x) >= 0 || 'Cannot be negative' })} error={errors.leadTimeDays} />
        </Field>
        <Field label="Status">
          <Select {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Address" className="sm:col-span-2"><Input {...register('address')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} maxLength={1000} /></Field>
      </form>
    </Modal>
  );
}
