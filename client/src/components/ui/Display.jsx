import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button.jsx';
import { titleCase } from '../../utils/format.js';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'gray', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone] || TONES.gray} ${className}`}>
      {children}
    </span>
  );
}

/** Badge driven by a status map like { low_stock: { label, tone } }. */
export function StatusBadge({ map, value, fallback }) {
  if (!value) return fallback ?? null;
  const s = map[value] || { label: titleCase(value), tone: 'gray' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Card({ title, subtitle, actions, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const STAT_TONES = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-violet-50 text-violet-600',
};

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint, onClick, title }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`card flex w-full items-start gap-3 p-4 text-left ${onClick ? 'transition hover:border-brand-300 hover:shadow-sm' : ''}`}>
      {Icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-slate-900" title={title || (typeof value === 'string' ? value : undefined)}>{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
      </div>
    </Tag>
  );
}

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {children}
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            value === t.value ? 'border-brand-800 text-brand-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-brand-700 ${className}`} />;
}

export function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-800">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-800">Could not load data</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Wraps a data region with loading / error / empty handling. */
export function DataState({ loading, error, onRetry, empty, emptyProps, children }) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}

export function KeyValue({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children ?? '—'}</dd>
    </div>
  );
}
