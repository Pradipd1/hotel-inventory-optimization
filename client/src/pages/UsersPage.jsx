import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound, Pencil, Plus, UserX, Users } from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useCategories } from '../hooks/useLookups.js';
import { usersApi } from '../services/endpoints.js';
import { errorMessage, fieldErrors } from '../services/api.js';
import { Badge, Card, PageHeader } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, SearchInput, Select } from '../components/ui/Form.jsx';
import { DataTable, Pagination } from '../components/ui/Table.jsx';
import { ConfirmDialog, Modal } from '../components/ui/Modal.jsx';
import { DEPARTMENTS } from '../utils/constants.js';
import { formatDateTime } from '../utils/format.js';

const PASSWORD_RULES = {
  required: 'Password is required',
  minLength: { value: 8, message: 'At least 8 characters' },
  validate: (v) => (/[A-Za-z]/.test(v) && /\d/.test(v)) || 'Include a letter and a number',
};

function UserModal({ open, onClose, user, onSaved }) {
  const toast = useToast();
  const { categories } = useCategories();
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => {
    if (open) {
      reset({
        name: user?.name || '', email: user?.email || '', password: '', role: user?.role || 'staff',
        department: user?.department || '', isActive: user ? String(user.isActive) : 'true',
        assignedCategories: (user?.assignedCategories || []).map((c) => c._id || c),
      });
    }
  }, [open, user, reset]);
  const role = watch('role');

  const submit = async (v) => {
    const body = {
      name: v.name, email: v.email, role: v.role, department: v.department, isActive: v.isActive === 'true',
      assignedCategories: v.role === 'staff' ? v.assignedCategories || [] : [],
    };
    if (!user) body.password = v.password;
    try {
      const res = user ? await usersApi.update(user._id, body) : await usersApi.create(body);
      toast.success(res.message);
      onSaved();
      onClose();
    } catch (err) {
      Object.entries(fieldErrors(err)).forEach(([f, m]) => setError(f, { message: m }));
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.name}` : 'Add user'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" loading={isSubmitting}>Save</Button></>}>
      <form id="user-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Full name" required error={errors.name?.message}><Input {...register('name', { required: 'Name is required' })} error={errors.name} /></Field>
        <Field label="Email" required error={errors.email?.message}><Input type="email" autoComplete="off" {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} error={errors.email} /></Field>
        {!user && <Field label="Initial password" required error={errors.password?.message} hint="8+ characters with a letter and a number"><Input type="password" autoComplete="new-password" {...register('password', PASSWORD_RULES)} error={errors.password} /></Field>}
        <Field label="Role" required>
          <Select {...register('role')}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Department">
          <Select {...register('department')}><option value="">None</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</Select>
        </Field>
        <Field label="Status">
          <Select {...register('isActive')}><option value="true">Active</option><option value="false">Inactive</option></Select>
        </Field>
        {role === 'staff' && (
          <Field label="Assigned inventory categories" hint="Leave all unchecked to give access to every category" className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
              {categories.map((c) => (
                <label key={c._id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" value={c._id} {...register('assignedCategories')} className="h-4 w-4 rounded border-slate-300" />
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ open, onClose, user }) {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset({ password: '' }); }, [open, reset]);
  const submit = async ({ password }) => {
    try {
      const res = await usersApi.resetPassword(user._id, password);
      toast.success(res.message);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Reset password for ${user?.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="reset-form" loading={isSubmitting}>Reset password</Button></>}>
      <form id="reset-form" onSubmit={handleSubmit(submit)} noValidate>
        <Field label="New password" error={errors.password?.message} hint="The user will be signed out of all sessions."><Input type="password" autoComplete="new-password" {...register('password', PASSWORD_RULES)} error={errors.password} /></Field>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', role: '', page: 1 });
  const { data, loading, error, reload } = useApi(() => usersApi.list({ ...filters, limit: 20 }), [JSON.stringify(filters)]);
  const [editing, setEditing] = useState(undefined);
  const [resetting, setResetting] = useState(null);
  const [deactivating, setDeactivating] = useState(null);

  const deactivate = async () => {
    try {
      const res = await usersApi.remove(deactivating._id);
      toast.success(res.message);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeactivating(null);
    }
  };

  return (
    <>
      <PageHeader title="Users & permissions" description="Manage accounts and roles. Role changes sign the user out so new permissions apply immediately." actions={<Button icon={Plus} onClick={() => setEditing(null)}>Add user</Button>} />
      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput value={filters.search} onChange={(search) => setFilters({ ...filters, search, page: 1 })} placeholder="Search name, email, department" className="sm:max-w-xs sm:flex-1" />
          <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })} className="sm:w-52" aria-label="Role">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <DataTable
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyProps={{ icon: Users, title: 'No users found' }}
          columns={[
            { key: 'name', header: 'User', render: (u) => <div><p className="font-medium text-slate-900">{u.name}{u._id === me?._id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
            { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'admin' ? 'purple' : u.role === 'inventory_manager' ? 'blue' : 'gray'}>{ROLE_LABELS[u.role]}</Badge> },
            { key: 'department', header: 'Department', render: (u) => u.department || '—' },
            { key: 'assigned', header: 'Assigned inventory', render: (u) => (u.role !== 'staff' ? <span className="text-xs text-slate-400">n/a</span> : u.assignedCategories?.length ? <span className="text-xs">{u.assignedCategories.map((c) => c.name).join(', ')}</span> : <span className="text-xs text-slate-500">All categories</span>) },
            { key: 'status', header: 'Status', render: (u) => <Badge tone={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Active' : 'Inactive'}</Badge> },
            { key: 'lastLoginAt', header: 'Last sign-in', render: (u) => <span className="whitespace-nowrap text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</span> },
            { key: 'actions', header: '', align: 'right', render: (u) => (
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Reset password for ${u.name}`} onClick={() => setResetting(u)}><KeyRound className="h-4 w-4" /></Button>
                {u._id !== me?._id && u.isActive && <Button size="icon" variant="ghost" aria-label={`Deactivate ${u.name}`} className="hover:text-red-600" onClick={() => setDeactivating(u)}><UserX className="h-4 w-4" /></Button>}
              </div>
            ) },
          ]}
        />
        <Pagination meta={data?.meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>
      <UserModal open={editing !== undefined} user={editing || undefined} onClose={() => setEditing(undefined)} onSaved={reload} />
      <ResetPasswordModal open={Boolean(resetting)} user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog open={Boolean(deactivating)} onClose={() => setDeactivating(null)} onConfirm={deactivate} title={`Deactivate ${deactivating?.name}?`} message="The user will be signed out and can no longer sign in. Their stock history is kept. You can reactivate the account later." confirmLabel="Deactivate" />
    </>
  );
}
