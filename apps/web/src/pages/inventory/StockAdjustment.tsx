import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { stockAdjustmentSchema } from '@erp/shared';
import { http } from '../../api/client';
import { useList, useRemove, useSave } from '../../api/hooks';
import { useStock, type VariantOption } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { DataTable } from '../../components/DataTable';
import { Badge, Button, Field, Input, Select } from '../../components/ui';
import { Section, FormErrors, errorText } from '../../components/form/Section';
import { DocHeader, today, type DocHeaderValues } from '../../components/doc/DocHeader';
import { VariantPicker } from '../../components/doc/VariantPicker';
import { JournalSection } from '../../components/doc/JournalSection';

interface Row { id: string; docNo: string; date: string; mode: string; referenceNo: string | null; totalValue: string; createdByName: string | null; firmName: string; branchName: string }
const money = (n: number | string) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export function StockAdjustmentsPage() {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const list = useList<Row>('inventory/adjustments', params);
  const remove = useRemove('inventory/adjustments');
  return <DataTable<Row> title="Stock Adjustments" columns={[
    { key: 'docNo', header: 'Number', render: (r) => <button className="text-brand font-medium" onClick={() => nav(`/accounting/inventory/adjustment/${r.id}`)}>{r.docNo}</button> },
    { key: 'date', header: 'Date' }, { key: 'mode', header: 'Mode', render: (r) => <Badge>{r.mode}</Badge> }, { key: 'referenceNo', header: 'Ref No' },
    { key: 'totalValue', header: 'Total Value', className: 'text-right', render: (r) => money(r.totalValue) }, { key: 'createdByName', header: 'Created By' },
  ]} data={list.data} loading={list.isLoading} params={params} onParams={setParams} onAdd={() => nav('/accounting/inventory/adjustment/new')}
    onDelete={async (r) => { if (confirm(`Delete ${r.docNo}? Stock and journal will be reversed.`)) { try { await remove.mutateAsync(r.id); } catch (e) { alert(errorText(e)); } } }} searchPlaceholder="Search by number, reference…" />;
}

interface Line { variant?: VariantOption; variantId: string; qtyAdjusted: number; pcsAdjusted: number; rate: number }

export function StockAdjustmentFormPage() {
  const { id } = useParams(); const nav = useNavigate();
  if (id && id !== 'new') return <StockAdjustmentDetail id={id} />;
  return <StockAdjustmentForm onDone={() => nav('/accounting/inventory/adjustment')} />;
}

function StockAdjustmentForm({ onDone }: { onDone: () => void }) {
  const { firm } = useAuth();
  const [h, setH] = useState<DocHeaderValues & { notes: string; mode: 'quantity' | 'value' }>({ firmId: firm?.id ?? '', branchId: '', seriesId: '', date: today(), referenceNo: '', notes: '', mode: 'quantity' });
  const [lines, setLines] = useState<Line[]>([{ variantId: '', qtyAdjusted: 0, pcsAdjusted: 0, rate: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const save = useSave('inventory/adjustments');
  const stock = useStock({ branchId: h.branchId });
  const available = (variantId: string) => stock.data?.find((s) => s.variantId === variantId);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setError(null);
    const parsed = stockAdjustmentSchema.safeParse({ ...h, items: lines.filter((l) => l.variantId) });
    if (!parsed.success) { setError(Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => `${k}: ${v?.join(', ')}`).join(' · ') || parsed.error.issues[0]?.message || 'Check the form'); return; }
    try { await save.mutateAsync({ data: parsed.data }); onDone(); } catch (e) { setError(errorText(e)); }
  };

  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">New Stock Adjustment</h1>
        <div className="flex gap-2"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button onClick={submit} disabled={save.isPending}>Save</Button></div></div>
      <FormErrors error={error} />
      <Section title="Adjustment details">
        <DocHeader docType="stock_adjustment" numberLabel="Adjust#" values={h} onChange={(p) => setH((s) => ({ ...s, ...p }))}
          extra={<Field label="Mode of Adjustment" required><Select value={h.mode} onChange={(e) => setH((s) => ({ ...s, mode: e.target.value as 'quantity' }))}><option value="quantity">Quantity Adjustment</option><option value="value">Value Adjustment</option></Select></Field>} />
        <div className="md:col-span-3"><Field label="Note"><textarea className="field h-16 py-2" value={h.notes} onChange={(e) => setH((s) => ({ ...s, notes: e.target.value }))} /></Field></div>
      </Section>
      <Section title="Items" action={<Button variant="ghost" className="h-8" onClick={() => setLines((ls) => [...ls, { variantId: '', qtyAdjusted: 0, pcsAdjusted: 0, rate: 0 }])}>+ Add New Item</Button>}>
        <div className="md:col-span-3 overflow-x-auto">
          <table className="w-full"><thead className="text-xs text-ink-muted"><tr><th className="text-left py-1 pr-2 w-8">#</th><th className="text-left pr-2 min-w-[280px]">Product / Sub Product *</th><th className="text-right pr-2">Qty Available</th><th className="text-right pr-2">Qty Adjusted (+/−) *</th><th className="text-right pr-2">Pcs Adjusted</th><th className="text-right pr-2">New Qty on Hand</th><th className="text-right pr-2">Rate</th><th /></tr></thead>
            <tbody>{lines.map((l, i) => {
              const av = available(l.variantId)?.qty ?? 0;
              return (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 pr-2 text-ink-muted">{i + 1}</td>
                  <td className="pr-2"><VariantPicker value={l.variant ?? null} onSelect={(v) => setLine(i, { variant: v, variantId: v.variantId, rate: l.rate || v.purchasePrice })} /></td>
                  <td className="pr-2 text-right tabular-nums">{l.variantId ? av : ''}</td>
                  <td className="pr-2"><Input type="number" step="any" className="text-right" value={l.qtyAdjusted || ''} onChange={(e) => setLine(i, { qtyAdjusted: Number(e.target.value) })} /></td>
                  <td className="pr-2"><Input type="number" className="text-right" value={l.pcsAdjusted || ''} onChange={(e) => setLine(i, { pcsAdjusted: Number(e.target.value) })} /></td>
                  <td className={`pr-2 text-right tabular-nums ${av + l.qtyAdjusted < 0 ? 'text-red-600' : ''}`}>{l.variantId ? av + l.qtyAdjusted : ''}</td>
                  <td className="pr-2"><Input type="number" step="any" className="text-right" value={l.rate || ''} disabled={l.qtyAdjusted < 0} title={l.qtyAdjusted < 0 ? 'Removals are costed at FIFO' : ''} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} /></td>
                  <td><Button variant="danger" className="px-2" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</Button></td>
                </tr>);
            })}</tbody></table>
        </div>
      </Section>
    </div>
  );
}

function StockAdjustmentDetail({ id }: { id: string }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['inventory/adjustments', id], queryFn: () => http.get<Row & { notes: string | null; items: { id: string; qtyAvailable: number; qtyAdjusted: number; pcsAdjusted: number; rate: number; value: number; variant?: { productName: string; variantName: string; sku: string } }[] }>(`/inventory/adjustments/${id}`) });
  const d = q.data;
  if (!d) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{d.docNo} <Badge tone="green">Posted</Badge></h1><Button variant="secondary" onClick={() => nav('/accounting/inventory/adjustment')}>Back</Button></div>
      <Section title="Details">
        <div><div className="label">Firm / Branch</div>{d.firmName} / {d.branchName}</div><div><div className="label">Date</div>{d.date}</div><div><div className="label">Mode</div>{d.mode}</div>
        <div><div className="label">Reference</div>{d.referenceNo ?? '—'}</div><div className="md:col-span-2"><div className="label">Note</div>{d.notes ?? '—'}</div>
      </Section>
      <section className="card"><table className="w-full"><thead className="text-xs text-ink-muted"><tr><th className="text-left px-5 py-2">Product</th><th className="text-right px-5">Qty Available</th><th className="text-right px-5">Adjusted</th><th className="text-right px-5">Pcs</th><th className="text-right px-5">Rate</th><th className="text-right px-5">Value</th></tr></thead>
        <tbody>{d.items.map((it) => <tr key={it.id} className="border-t border-line"><td className="px-5 py-2">{it.variant?.productName} · {it.variant?.variantName} <span className="text-ink-muted text-xs">{it.variant?.sku}</span></td><td className="px-5 text-right">{it.qtyAvailable}</td><td className={`px-5 text-right ${it.qtyAdjusted < 0 ? 'text-red-600' : 'text-green-700'}`}>{it.qtyAdjusted > 0 ? '+' : ''}{it.qtyAdjusted}</td><td className="px-5 text-right">{it.pcsAdjusted}</td><td className="px-5 text-right">{money(it.rate)}</td><td className="px-5 text-right">{money(it.value)}</td></tr>)}
          <tr className="border-t-2 border-line font-semibold"><td className="px-5 py-2" colSpan={5}>Total</td><td className="px-5 text-right">{money(d.totalValue)}</td></tr></tbody></table></section>
      <JournalSection sourceType="stock_adjustment" sourceId={id} />
    </div>
  );
}
