import { useState, type ReactNode } from 'react';
import type { Paged } from '@erp/shared';
import { Button, EmptyState, Input, Select } from './ui';

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; sortable?: boolean; className?: string }

interface Props<T> {
  title: string;
  columns: Column<T>[];
  data?: Paged<T>;
  loading?: boolean;
  params: { page: number; pageSize: number; search: string; sort?: string };
  onParams: (p: Props<T>['params']) => void;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
}

/** Shared list screen: search, sort by column, pagination, row actions. */
export function DataTable<T extends { id: string }>({ title, columns, data, loading, params, onParams, onAdd, onEdit, onDelete, searchPlaceholder, toolbar }: Props<T>) {
  const [search, setSearch] = useState(params.search);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / params.pageSize));
  const from = total ? (params.page - 1) * params.pageSize + 1 : 0;
  const to = Math.min(total, params.page * params.pageSize);

  const toggleSort = (key: string) => {
    const next = params.sort === key ? `-${key}` : key;
    onParams({ ...params, sort: next, page: 1 });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">{toolbar}{onAdd && <Button onClick={onAdd}>+ Add</Button>}</div>
      </div>
      <form className="mb-3 max-w-md" onSubmit={(e) => { e.preventDefault(); onParams({ ...params, search, page: 1 }); }}>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder ?? 'Search…'} />
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs uppercase tracking-wide text-ink-muted bg-canvas">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                  {c.sortable ? (
                    <button className="hover:text-ink" onClick={() => toggleSort(c.key)}>
                      {c.header}{params.sort === c.key ? ' ↑' : params.sort === `-${c.key}` ? ' ↓' : ''}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-ink-muted">Loading…</td></tr>}
            {!loading && !data?.rows.length && (
              <tr><td colSpan={columns.length + 1}><EmptyState title={`No ${title.toLowerCase()} yet`} action={onAdd && <Button variant="secondary" onClick={onAdd}>Create first</Button>} /></td></tr>
            )}
            {data?.rows.map((row) => (
              <tr key={row.id} className="border-t border-line hover:bg-canvas/60">
                {columns.map((c) => <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</td>)}
                {(onEdit || onDelete) && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {onEdit && <Button variant="ghost" className="h-8 px-2" onClick={() => onEdit(row)}>Edit</Button>}
                    {onDelete && <Button variant="danger" className="h-8 px-2" onClick={() => onDelete(row)}>Delete</Button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3 text-ink-muted">
        <label className="flex items-center gap-2">Rows per page
          <Select className="w-20 h-8" value={params.pageSize} onChange={(e) => onParams({ ...params, pageSize: Number(e.target.value), page: 1 })}>
            {[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <span>Showing {from}-{to} of {total}</span>
          <Button variant="secondary" className="h-8 px-3" disabled={params.page <= 1} onClick={() => onParams({ ...params, page: params.page - 1 })}>‹</Button>
          <span className="px-2">{params.page} / {pages}</span>
          <Button variant="secondary" className="h-8 px-3" disabled={params.page >= pages} onClick={() => onParams({ ...params, page: params.page + 1 })}>›</Button>
        </div>
      </div>
    </div>
  );
}
