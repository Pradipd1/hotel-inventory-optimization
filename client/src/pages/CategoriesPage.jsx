import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { categoriesApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Card, PageHeader } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Form.jsx';
import { DataTable } from '../components/ui/Table.jsx';
import { ConfirmDialog, Modal } from '../components/ui/Modal.jsx';
import { formatCurrency } from '../utils/format.js';

function CategoryModal({ open, onClose, category, onSaved }) {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => {
    if (open) reset({ name: category?.name || '', description: category?.description || '', color: category?.color || '#1e3a8a' });
  }, [open, category, reset]);

  const submit = async (v) => {
    try {
      const res = category ? await categoriesApi.update(category._id, v) : await categoriesApi.create(v);
      toast.success(res.message);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? 'Edit category' : 'Add category'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="cat-form" loading={isSubmitting}>Save</Button></>}
    >
      <form id="cat-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} error={errors.name} />
        </Field>
        <Field label="Description"><Input {...register('description')} maxLength={300} /></Field>
        <Field label="Colour" hint="Used in charts"><Input type="color" className="h-10 w-20 p-1" {...register('color')} /></Field>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const { isAdmin, currency } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => categoriesApi.list(), []);
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);

  const remove = async () => {
    try {
      const res = await categoriesApi.remove(deleting._id);
      toast.success(res.message);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <PageHeader title="Categories" description="Group inventory for filtering, reporting and staff assignments." actions={<Button icon={Plus} onClick={() => setEditing(null)}>Add category</Button>} />
      <Card bodyClassName="p-0">
        <DataTable
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyProps={{ icon: Tags, title: 'No categories yet' }}
          columns={[
            { key: 'name', header: 'Category', render: (c) => <span className="flex items-center gap-2 font-medium text-slate-900"><span className="h-3 w-3 rounded-sm" style={{ background: c.color }} />{c.name}</span> },
            { key: 'description', header: 'Description', render: (c) => <span className="text-slate-500">{c.description || '—'}</span> },
            { key: 'itemCount', header: 'Items', align: 'right' },
            { key: 'stockValue', header: 'Stock value', align: 'right', render: (c) => formatCurrency(c.stockValue, currency) },
            { key: 'actions', header: '', align: 'right', render: (c) => (
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                {isAdmin && <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} className="hover:text-red-600" onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            ) },
          ]}
        />
      </Card>
      <CategoryModal open={editing !== undefined} category={editing || undefined} onClose={() => setEditing(undefined)} onSaved={reload} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={remove} title={`Delete ${deleting?.name}?`} message="Only categories without items can be deleted." confirmLabel="Delete" />
    </>
  );
}
