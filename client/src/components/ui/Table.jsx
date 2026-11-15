import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataState } from './Display.jsx';

/**
 * columns: [{ key, header, render?(row), align?, className?, sortable? }]
 * sort: { key, order } and onSort(key) enable sortable headers.
 */
/** `renderDetail(row)` adds a full-width second row under each row (e.g. an explanation). */
export function DataTable({ columns, rows, rowKey = '_id', loading, error, onRetry, emptyProps, onRowClick, sort, onSort, footer, renderDetail }) {
  const keyOf = typeof rowKey === 'function' ? rowKey : (r) => r[rowKey];
  return (
    <DataState loading={loading} error={error} onRetry={onRetry} empty={!rows?.length} emptyProps={emptyProps}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const align = c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
                return (
                  <th key={c.key} className={`th ${align} ${c.headerClassName || ''}`} aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortable && onSort ? (
                      <button className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${active ? 'text-slate-800' : ''}`} onClick={() => onSort(c.key)}>
                        {c.header}
                        {active && (sort.order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows?.map((row, i) => {
              const k = keyOf(row) ?? i;
              const detail = renderDetail?.(row);
              const cells = (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''} ${detail ? '[&>td]:pb-1' : ''}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''} ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
              if (!detail) return cells;
              return [
                cells,
                <tr key={`${k}-detail`} className="!border-t-0">
                  <td colSpan={columns.length} className="px-4 pt-0 pb-3">{detail}</td>
                </tr>,
              ];
            })}
          </tbody>
          {footer}
        </table>
      </div>
    </DataState>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total === 0) return null;
  const { page, pages, total, limit } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>
        Showing <b>{from}</b>–<b>{to}</b> of <b>{total}</b>
      </span>
      <div className="flex items-center gap-1">
        <button className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2">
          Page {page} of {pages}
        </span>
        <button className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
