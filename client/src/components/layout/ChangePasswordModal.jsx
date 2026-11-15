import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { authApi } from '../../services/endpoints.js';
import { errorMessage } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function ChangePasswordModal({ open, onClose }) {
  const { setToken } = useAuth();
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset({ currentPassword: '', newPassword: '', confirm: '' });
  }, [open, reset]);

  const submit = async ({ currentPassword, newPassword }) => {
    try {
      const res = await authApi.changePassword({ currentPassword, newPassword });
      setToken(res.token); // other sessions are signed out; this one continues
      toast.success('Password updated');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="pw-form" loading={isSubmitting}>Update password</Button>
        </>
      }
    >
      <form id="pw-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Current password" error={errors.currentPassword?.message}>
          <Input type="password" autoComplete="current-password" {...register('currentPassword')} error={errors.currentPassword} />
        </Field>
        <Field label="New password" error={errors.newPassword?.message} hint="At least 8 characters with a letter and a number">
          <Input type="password" autoComplete="new-password" {...register('newPassword')} error={errors.newPassword} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} error={errors.confirm} />
        </Field>
      </form>
    </Modal>
  );
}
