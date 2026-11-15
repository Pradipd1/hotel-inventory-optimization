import { format, formatDistanceToNow, parseISO } from 'date-fns';

const toDate = (v) => (v instanceof Date ? v : typeof v === 'string' ? parseISO(v) : new Date(v));

export function formatCurrency(value, currency = 'NPR', { compact = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

export function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: digits });
}

export function formatQty(value, unit) {
  const n = formatNumber(value, 3);
  return unit && n !== '—' ? `${n} ${unit}` : n;
}

export function formatDate(value, pattern = 'dd MMM yyyy') {
  if (!value) return '—';
  return format(toDate(value), pattern);
}

export function formatDateTime(value) {
  return formatDate(value, 'dd MMM yyyy, HH:mm');
}

export function timeAgo(value) {
  if (!value) return '';
  return formatDistanceToNow(toDate(value), { addSuffix: true });
}

export function monthLabel(key) {
  // "2026-11" -> "Nov 26"
  const [y, m] = key.split('-').map(Number);
  return format(new Date(y, m - 1, 1), 'MMM yy');
}

export const titleCase = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

export function toDateInput(value) {
  if (!value) return '';
  return format(toDate(value), 'yyyy-MM-dd');
}
