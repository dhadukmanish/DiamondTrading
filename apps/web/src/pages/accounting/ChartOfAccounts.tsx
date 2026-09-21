import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { accountSubTypes, accountTypes, type AccountInput } from '@erp/shared';
import { http } from '../../api/client';
import { useAccounts, useCurrencies, type Account } from '../../api/lookups';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Checkbox, Field, Input, Modal, Select } from '../../components/ui';
import { FormErrors, errorText } from '../../components/form/Section';

const TYPE_LABEL: Record<string, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };
const TYPE_TONE: Record<string, 'blue' | 'orange' | 'gray' | 'green' | 'red'> = { asset: 'blue', liability: 'orange', equity: 'gray', income: 'green', expense: 'red' };

export function ChartOfAccountsPage() {
  const { firm, firms } = useAuth();
  const qc = useQueryClient();
  const accounts = useAccounts({ firmId: firm?.id });
  const currencies = useCurrencies();
  const [search, setSearch] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [group, setGroup] = useState<'none' | 'type' | 'subType'>('type');
  const [editing, setEditing] = useState<(Partial<AccountInput> & { id?: string; isSystem?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => (accounts.data ?? []).filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) && (!hideZero || a.balance !== 0)), [accounts.data, search, hideZero]);
  const groups = useMemo(() => {
    if (group === 'none') return [['', rows] as const];
    const m = new Map<string, Account[]>();
    for (const r of rows) { const k = group === 'type' ? TYPE_LABEL[r.type]! : r.subType; m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()];
  }, [rows, group]);

  const openNew = () => { setError(null); setEditing({ type: 'asset', subType: 'Cash', currencyId: currencies.data?.find((c) => c.code === 'INR')?.id ?? '', isGroup: false, isActive: true }); };
  const save = async () => {
    if (!editing) return; setError(null);
    const body = { name: editing.name, type: editing.type, subType: editing.subType, firmId: editing.firmId || null, parentId: editing.parentId || null, currencyId: editing.currencyId, isGroup: !!editing.isGroup, notes: editing.notes || null, isActive: editing.isActive ?? true };
    try {
      await (editing.id ? http.put(`/accounts/${editing.id}`, body) : http.post('/accounts', body));
      await qc.invalidateQueries({ queryKey: ['accounts'] }); setEditing(null);
    } catch (e) { setError(errorText(e)); }
  };
  const remove = async (a: Account) => {
    if (!confirm(`Delete account "${a.name}"?`)) return;
    try { await http.del(`/accounts/${a.id}`); await qc.invalidateQueries({ queryKey: ['accounts'] }); } catch (e) { alert(errorText(e)); }
  };
  const parents = (accounts.data ?? []).filter((a) => a.type === editing?.type && a.id !== editing?.id);
  const symbol = (id: string) => currencies.data?.find((c) => c.id === id)?.symbol ?? '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4"><h1 className="text-xl font-semibold">Chart Of Accounts</h1><Button onClick={openNew}>+ Add</Button></div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Input className="max-w-xs" placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Checkbox label="Remove 0 balance accounts" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
        <Select className="w-48 h-9" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}><option value="none">No grouping</option><option value="type">Group by Type</option><option value="subType">Group by Sub Type</option></Select>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead className="text-xs uppercase tracking-wide text-ink-muted bg-canvas"><tr>
            <th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Sub Type</th><th className="px-4 py-3">Nature</th><th className="px-4 py-3">Group</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody>
            {groups.map(([g, list]) => (
              <GroupRows key={g} label={g} list={list} symbol={symbol} onEdit={(a) => { setError(null); setEditing({ ...a, type: a.type as never, notes: a.notes ?? undefined }); }} onDelete={remove} />
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-muted">{accounts.isLoading ? 'Loading…' : 'No accounts match'}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} title={editing?.id ? 'Edit Account' : 'New Account'} onClose={() => setEditing(null)}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} disabled={editing?.isSystem}>Save</Button></>}>
        <FormErrors error={error} />
        {editing?.isSystem && <p className="text-sm text-ink-muted bg-canvas rounded px-3 py-2">System account — read only.</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Account Name" required><Input value={editing?.name ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, name: e.target.value }))} /></Field></div>
          <Field label="Account Type" required><Select value={editing?.type ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, type: e.target.value as never, subType: accountSubTypes[e.target.value as keyof typeof accountSubTypes]?.[0], parentId: null }))}>{accountTypes.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>
          <Field label="Sub Type" required><Select value={editing?.subType ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, subType: e.target.value }))}>{(accountSubTypes[editing?.type as keyof typeof accountSubTypes] ?? []).map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Firm"><Select value={editing?.firmId ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, firmId: e.target.value || null }))}><option value="">All Firms</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          <Field label="Parent Account"><Select value={editing?.parentId ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, parentId: e.target.value || null }))}><option value="">None</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Currency" required><Select value={editing?.currencyId ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, currencyId: e.target.value }))}>{(currencies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}</Select></Field>
          <Checkbox label="Group account (non-postable)" checked={!!editing?.isGroup} onChange={(e) => setEditing((s) => s && ({ ...s, isGroup: e.target.checked }))} />
          <div className="col-span-2"><Field label="Notes"><textarea className="field h-20 py-2" maxLength={500} value={editing?.notes ?? ''} onChange={(e) => setEditing((s) => s && ({ ...s, notes: e.target.value }))} /></Field></div>
        </div>
      </Modal>
    </div>
  );
}

function GroupRows({ label, list, symbol, onEdit, onDelete }: { label: string; list: Account[]; symbol: (id: string) => string; onEdit: (a: Account) => void; onDelete: (a: Account) => void }) {
  return (
    <>
      {label && <tr className="bg-canvas/70"><td colSpan={7} className="px-4 py-2 font-semibold">{label} <span className="text-ink-muted font-normal">({list.length})</span></td></tr>}
      {list.map((a) => (
        <tr key={a.id} className="border-t border-line hover:bg-canvas/60">
          <td className="px-4 py-3 font-medium">{a.name} {a.isSystem && <Badge>System</Badge>}</td>
          <td className="px-4 py-3"><Badge tone={TYPE_TONE[a.type]}>{TYPE_LABEL[a.type]}</Badge></td>
          <td className="px-4 py-3">{a.subType}</td>
          <td className="px-4 py-3 capitalize">{a.nature}</td>
          <td className="px-4 py-3">{a.isGroup ? 'Yes' : 'No'}</td>
          <td className={`px-4 py-3 text-right tabular-nums ${a.balance < 0 ? 'text-red-600' : ''}`}>{symbol(a.currencyId)}{a.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td className="px-4 py-3 text-right whitespace-nowrap">
            {a.isSystem ? <Button variant="ghost" className="h-8 px-2" onClick={() => onEdit(a)}>View</Button> : <><Button variant="ghost" className="h-8 px-2" onClick={() => onEdit(a)}>Edit</Button><Button variant="danger" className="h-8 px-2" onClick={() => onDelete(a)}>Delete</Button></>}
          </td>
        </tr>
      ))}
    </>
  );
}
