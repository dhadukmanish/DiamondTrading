import { useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useList, useRemove, useSave } from '../api/hooks';
import { DataTable, type Column } from './DataTable';
import { Button, Checkbox, Field, Input, Modal, Select } from './ui';

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'email' | 'password';
export interface FieldDef {
  name: string; label: string; type?: FieldType; required?: boolean;
  options?: { value: string; label: string }[] | (() => { value: string; label: string }[]);
  placeholder?: string; hint?: string; span?: 1 | 2; defaultValue?: unknown;
  /** hide unless editing / creating */
  onlyOn?: 'create' | 'edit';
}
interface Props<T> {
  title: string; resource: string; columns: Column<T>[]; fields: FieldDef[];
  searchPlaceholder?: string; toolbar?: ReactNode; wide?: boolean;
  /** transform form values before sending */
  toPayload?: (values: Record<string, unknown>, editing?: T) => unknown;
  /** seed the form when editing */
  toForm?: (row: T) => Record<string, unknown>;
}

/**
 * Config-driven list + modal form. Enough for every simple master
 * (currencies, units, tax rates, categories, series, custom fields, firms, branches…).
 */
export function MasterPage<T extends { id: string }>({ title, resource, columns, fields, searchPlaceholder, toolbar, wide, toPayload, toForm }: Props<T>) {
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | undefined>();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const list = useList<T>(resource, params);
  const save = useSave<T>(resource);
  const remove = useRemove(resource);

  const defaults = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'boolean' ? false : '')])), [fields]);

  const openCreate = () => { setEditing(undefined); setValues(defaults); setError(null); setOpen(true); };
  const openEdit = (row: T) => { setEditing(row); setValues({ ...defaults, ...(toForm ? toForm(row) : row) }); setError(null); setOpen(true); };

  const submit = async () => {
    setError(null);
    try {
      const payload = toPayload ? toPayload(values, editing) : normalize(values, fields);
      await save.mutateAsync({ id: editing?.id, data: payload });
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? (e.details ? `${e.message}: ${summarize(e.details)}` : e.message) : String(e));
    }
  };

  const onDelete = async (row: T) => {
    if (!confirm(`Delete this ${title.toLowerCase().replace(/s$/, '')}?`)) return;
    try { await remove.mutateAsync(row.id); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };

  const visible = fields.filter((f) => !f.onlyOn || (f.onlyOn === 'edit' ? !!editing : !editing));

  return (
    <>
      <DataTable title={title} columns={columns} data={list.data} loading={list.isLoading} params={params} onParams={setParams}
        onAdd={openCreate} onEdit={openEdit} onDelete={onDelete} searchPlaceholder={searchPlaceholder} toolbar={toolbar} />
      <Modal open={open} title={`${editing ? 'Edit' : 'New'} ${title.replace(/s$/, '')}`} onClose={() => setOpen(false)} wide={wide}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={save.isPending}>Save</Button></>}>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          {visible.map((f) => <div key={f.name} className={f.span === 2 ? 'col-span-2' : ''}><FormField def={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} /></div>)}
        </div>
      </Modal>
    </>
  );
}

function FormField({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (def.type === 'boolean') return <Checkbox label={def.label} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  if (def.type === 'select') {
    const opts = typeof def.options === 'function' ? def.options() : def.options ?? [];
    return (
      <Field label={def.label} required={def.required} hint={def.hint}>
        <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    );
  }
  return (
    <Field label={def.label} required={def.required} hint={def.hint}>
      <Input type={def.type ?? 'text'} value={String(value ?? '')} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** Empty strings → null, number fields → numbers. */
function normalize(values: Record<string, unknown>, fields: FieldDef[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'number') out[f.name] = v === '' || v == null ? undefined : Number(v);
    else if (f.type === 'boolean') out[f.name] = !!v;
    else out[f.name] = v === '' ? null : v;
    if (f.name === 'password' && !v) delete out[f.name];
  }
  return out;
}

function summarize(details: unknown) {
  const d = details as { fieldErrors?: Record<string, string[]> };
  return d.fieldErrors ? Object.entries(d.fieldErrors).map(([k, v]) => `${k} ${v.join(', ')}`).join('; ') : '';
}
