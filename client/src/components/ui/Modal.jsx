import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button.jsx';
import { Textarea } from './Form.jsx';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md', closeOnBackdrop = true }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input, select, textarea, button:not([data-close])')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={closeOnBackdrop ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-xl ${SIZES[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation dialog. `onConfirm` may return a promise; the dialog shows a spinner until it settles.
 * With `withNote`, a textarea is shown and its value passed to onConfirm.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'danger', withNote = false, notePlaceholder = 'Add a note (optional)' }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(note);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={variant} onClick={confirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        {variant === 'danger' && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
        )}
        <div className="flex-1 text-sm text-slate-600">{message}</div>
      </div>
      {withNote && <Textarea className="mt-4" value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} maxLength={500} />}
    </Modal>
  );
}
