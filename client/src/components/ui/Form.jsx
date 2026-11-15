import { Children, cloneElement, forwardRef, isValidElement, useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';

const CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

export function Field({ label, error, hint, required, children, className = '', htmlFor }) {
  const autoId = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  // Link the label (and error/hint text) to a single form control so clicking the label focuses it
  // and screen readers announce the field name.
  const isControl = only && (CONTROL_TAGS.has(only.type) || [Input, Select, Textarea].includes(only.type));
  const controlId = htmlFor || only?.props.id || (isControl ? `f${autoId}` : undefined);
  const messageId = (error || hint) && controlId ? `${controlId}-msg` : undefined;
  const control = isControl
    ? cloneElement(only, { id: controlId, 'aria-describedby': only.props['aria-describedby'] ?? messageId, 'aria-required': only.props['aria-required'] ?? (required || undefined) })
    : children;
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={controlId}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {control}
      {error ? <p id={messageId} className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p id={messageId} className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ error, className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={Boolean(error)} {...props} />;
});

export const Select = forwardRef(function Select({ error, className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`input pr-8 ${error ? 'input-error' : ''} ${className}`} aria-invalid={Boolean(error)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ error, className = '', rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={Boolean(error)} {...props} />;
});

/** Search box with built-in debounce. */
export function SearchInput({ value, onChange, placeholder = 'Search...', delay = 350, className = '' }) {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    if (text === (value || '')) return undefined;
    const t = setTimeout(() => onChange(text), delay);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pr-8 pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {text && (
        <button type="button" onClick={() => { setText(''); onChange(''); }} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Converts form strings to numbers; empty → null (meaning "not configured"). */
export const numberOrNull = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
