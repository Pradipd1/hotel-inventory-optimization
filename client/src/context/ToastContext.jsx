import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', iconCls: 'text-emerald-600' },
  error: { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-800', iconCls: 'text-red-600' },
  warning: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-800', iconCls: 'text-amber-600' },
  info: { icon: Info, cls: 'border-brand-200 bg-brand-50 text-brand-800', iconCls: 'text-brand-600' },
};

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (type, message, timeout = 4500) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      if (timeout) setTimeout(() => dismiss(id), timeout);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m, 7000),
      warning: (m) => push('warning', m, 6000),
      info: (m) => push('info', m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:w-96" aria-live="polite">
        {toasts.map((t) => {
          const s = STYLES[t.type];
          const Icon = s.icon;
          return (
            <div key={t.id} role="status" className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${s.cls}`}>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconCls}`} />
              <p className="flex-1 leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
