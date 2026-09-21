import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productTransferSchema, stockTransferSchema } from '@erp/shared';
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

const money = (n: number | string) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
type V = { productName: string; variantName: string; sku: string };

// ---------- Stock Transfer (Firm/Branch) ----------
interface STRow { id: string; docNo: string; date: string; referenceNo: string | null; status: string; totalValue: string; createdByName: string | null; firmName: string; branchName: string; toFirmName: string; toBranchName: string }

export function StockTransfersPage() {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const list = useList<STRow>('inventory/transfers', params); const remove = useRemove('inventory/transfers');
  return <DataTable<STRow> title="Stock Transfer F/B" columns={[
    { key: 'docNo', header: 'Number', render: (r) => <button className="text-brand font-medium" onClick={() => nav(`/accounting/inventory/transfer/${r.id}`)}>{r.docNo}</button> },
    { key: 'date', header: 'Date' }, { key: 'from', header: 'From', render: (r) => `${r.firmName} / ${r.branchName}` }, { key: 'to', header: 'To', render: (r) => `${r.toFirmName} / ${r.toBranchName}` },
    { key: 'referenceNo', header: 'Ref No' }, { key: 'status', header: 'Status', render: (r) => <Badge tone="green">{r.status}</Badge> },
    { key: 'totalValue', header: 'Total Value', className: 'text-right', render: (r) => money(r.totalValue) }, { key: 'createdByName', header: 'Created By' },
  ]} data={list.data} loading={list.isLoading} params={params} onParams={setParams} onAdd={() => nav('/accounting/inventory/transfer/new')}
    onDelete={async (r) => { if (confirm(`Revert ${r.docNo}? Stock moves back and the entry is removed.`)) { try { await remove.mutateAsync(r.id); } catch (e) { alert(errorText(e)); } } }} />;
}

export function StockTransferFormPage() {
  const { id } = useParams(); const nav = useNavigate();
  if (id && id !== 'new') return <TransferDetail kind="stock" id={id} />;
  return <StockTransferForm onDone={() => nav('/accounting/inventory/transfer')} />;
}

interface STLine { variant?: VariantOption; variantId: string; qty: number; pcs: number }
function StockTransferForm({ onDone }: { onDone: () => void }) {
  const { firm, firms } = useAuth();
  const [h, setH] = useState<DocHeaderValues & { notes: string; toFirmId: string; toBranchId: string }>({ firmId: firm?.id ?? '', branchId: '', seriesId: '', date: today(), referenceNo: '', notes: '', toFirmId: firm?.id ?? '', toBranchId: '' });
  const [lines, setLines] = useState<STLine[]>([{ variantId: '', qty: 0, pcs: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const save = useSave('inventory/transfers');
  const stock = useStock({ branchId: h.branchId });
  const toFirm = firms.find((f) => f.id === h.toFirmId);
  const av = (vid: string) => stock.data?.find((s) => s.variantId === vid);
  const setLine = (i: number, patch: Partial<STLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.qty * (av(l.variantId)?.avgRate ?? 0), 0);

  const submit = async () => {
    setError(null);
    const parsed = stockTransferSchema.safeParse({ ...h, items: lines.filter((l) => l.variantId) });
    if (!parsed.success) { setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')); return; }
    try { await save.mutateAsync({ data: parsed.data }); onDone(); } catch (e) { setError(errorText(e)); }
  };
  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">New Stock Transfer</h1><div className="flex gap-2"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button onClick={submit} disabled={save.isPending}>Save</Button></div></div>
      <FormErrors error={error} />
      <Section title="Transfer details">
        <DocHeader docType="stock_transfer" numberLabel="Transfer#" values={h} onChange={(p) => setH((s) => ({ ...s, ...p }))} />
        <Field label="To Firm" required><Select value={h.toFirmId} onChange={(e) => setH((s) => ({ ...s, toFirmId: e.target.value, toBranchId: '' }))}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
        <Field label="To Branch" required><Select value={h.toBranchId} onChange={(e) => setH((s) => ({ ...s, toBranchId: e.target.value }))}><option value="">Select branch</option>{toFirm?.branches.filter((b) => b.id !== h.branchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <div className="md:col-span-3"><Field label="Notes"><textarea className="field h-16 py-2" value={h.notes} onChange={(e) => setH((s) => ({ ...s, notes: e.target.value }))} /></Field></div>
      </Section>
      <Section title="Items" action={<Button variant="ghost" className="h-8" onClick={() => setLines((ls) => [...ls, { variantId: '', qty: 0, pcs: 0 }])}>+ Add New Item</Button>}>
        <div className="md:col-span-3 overflow-x-auto"><table className="w-full"><thead className="text-xs text-ink-muted"><tr><th className="text-left py-1 pr-2 w-8">#</th><th className="text-left pr-2 min-w-[280px]">Product / Sub Product *</th><th className="text-right pr-2">Available</th><th className="text-right pr-2">Pcs</th><th className="text-right pr-2">Qty *</th><th className="text-right pr-2">Unit Price (FIFO avg)</th><th className="text-right pr-2">Total</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => { const s = av(l.variantId); return (
            <tr key={i} className="border-t border-line"><td className="py-2 pr-2 text-ink-muted">{i + 1}</td>
              <td className="pr-2"><VariantPicker value={l.variant ?? null} onSelect={(v) => setLine(i, { variant: v, variantId: v.variantId })} /></td>
              <td className={`pr-2 text-right ${s && s.qty < l.qty ? 'text-red-600' : ''}`}>{s?.qty ?? ''}</td>
              <td className="pr-2"><Input type="number" className="text-right" value={l.pcs || ''} onChange={(e) => setLine(i, { pcs: Number(e.target.value) })} /></td>
              <td className="pr-2"><Input type="number" step="any" className="text-right" value={l.qty || ''} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td className="pr-2 text-right">{s ? money(s.avgRate) : ''}</td><td className="pr-2 text-right">{s ? money(l.qty * s.avgRate) : ''}</td>
              <td><Button variant="danger" className="px-2" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</Button></td></tr>); })}
            <tr className="border-t-2 border-line font-semibold"><td colSpan={6} className="py-2 text-right pr-2">Total (estimated)</td><td className="text-right pr-2">{money(total)}</td><td /></tr></tbody></table></div>
      </Section>
    </div>
  );
}

// ---------- Product Transfer (product → product) ----------
interface PTRow { id: string; docNo: string; date: string; referenceNo: string | null; status: string; totalValue: string; createdByName: string | null; firmName: string; branchName: string }

export function ProductTransfersPage() {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const list = useList<PTRow>('inventory/product-transfers', params); const remove = useRemove('inventory/product-transfers');
  return <DataTable<PTRow> title="Product Transfer" columns={[
    { key: 'docNo', header: 'Number', render: (r) => <button className="text-brand font-medium" onClick={() => nav(`/accounting/inventory/item-transfer/${r.id}`)}>{r.docNo}</button> },
    { key: 'date', header: 'Date' }, { key: 'firm', header: 'Firm / Branch', render: (r) => `${r.firmName} / ${r.branchName}` }, { key: 'referenceNo', header: 'Ref No' },
    { key: 'status', header: 'Status', render: (r) => <Badge tone="green">{r.status}</Badge> }, { key: 'totalValue', header: 'Total Value', className: 'text-right', render: (r) => money(r.totalValue) }, { key: 'createdByName', header: 'Created By' },
  ]} data={list.data} loading={list.isLoading} params={params} onParams={setParams} onAdd={() => nav('/accounting/inventory/item-transfer/new')}
    onDelete={async (r) => { if (confirm(`Revert ${r.docNo}?`)) { try { await remove.mutateAsync(r.id); } catch (e) { alert(errorText(e)); } } }} />;
}

export function ProductTransferFormPage() {
  const { id } = useParams(); const nav = useNavigate();
  if (id && id !== 'new') return <TransferDetail kind="product" id={id} />;
  return <ProductTransferForm onDone={() => nav('/accounting/inventory/item-transfer')} />;
}

interface PTLine { from?: VariantOption; to?: VariantOption; fromVariantId: string; toVariantId: string; qty: number; pcs: number }
function ProductTransferForm({ onDone }: { onDone: () => void }) {
  const { firm } = useAuth();
  const [h, setH] = useState<DocHeaderValues & { notes: string }>({ firmId: firm?.id ?? '', branchId: '', seriesId: '', date: today(), referenceNo: '', notes: '' });
  const [lines, setLines] = useState<PTLine[]>([{ fromVariantId: '', toVariantId: '', qty: 0, pcs: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const save = useSave('inventory/product-transfers');
  const stock = useStock({ branchId: h.branchId });
  const av = (vid: string) => stock.data?.find((s) => s.variantId === vid);
  const setLine = (i: number, patch: Partial<PTLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = async () => {
    setError(null);
    const parsed = productTransferSchema.safeParse({ ...h, items: lines.filter((l) => l.fromVariantId) });
    if (!parsed.success) { setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')); return; }
    try { await save.mutateAsync({ data: parsed.data }); onDone(); } catch (e) { setError(errorText(e)); }
  };
  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">New Product Transfer</h1><div className="flex gap-2"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button onClick={submit} disabled={save.isPending}>Save</Button></div></div>
      <FormErrors error={error} />
      <Section title="Transfer details">
        <DocHeader docType="product_transfer" numberLabel="Transfer#" values={h} onChange={(p) => setH((s) => ({ ...s, ...p }))} />
        <div className="md:col-span-3"><Field label="Notes"><textarea className="field h-16 py-2" value={h.notes} onChange={(e) => setH((s) => ({ ...s, notes: e.target.value }))} /></Field></div>
      </Section>
      <Section title="Items" action={<Button variant="ghost" className="h-8" onClick={() => setLines((ls) => [...ls, { fromVariantId: '', toVariantId: '', qty: 0, pcs: 0 }])}>+ Add New Item</Button>}>
        <div className="md:col-span-3 overflow-x-auto"><table className="w-full"><thead className="text-xs text-ink-muted"><tr><th className="text-left py-1 pr-2 w-8">#</th><th className="text-left pr-2 min-w-[240px]">From Product *</th><th className="text-right pr-2">Available</th><th className="text-left pr-2 min-w-[240px]">To Product *</th><th className="text-right pr-2">Pcs</th><th className="text-right pr-2">Qty *</th><th className="text-right pr-2">Unit Price</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => { const s = av(l.fromVariantId); return (
            <tr key={i} className="border-t border-line"><td className="py-2 pr-2 text-ink-muted">{i + 1}</td>
              <td className="pr-2"><VariantPicker value={l.from ?? null} onSelect={(v) => setLine(i, { from: v, fromVariantId: v.variantId })} /></td>
              <td className={`pr-2 text-right ${s && s.qty < l.qty ? 'text-red-600' : ''}`}>{s?.qty ?? ''}</td>
              <td className="pr-2"><VariantPicker value={l.to ?? null} onSelect={(v) => setLine(i, { to: v, toVariantId: v.variantId })} placeholder="Convert to…" /></td>
              <td className="pr-2"><Input type="number" className="text-right" value={l.pcs || ''} onChange={(e) => setLine(i, { pcs: Number(e.target.value) })} /></td>
              <td className="pr-2"><Input type="number" step="any" className="text-right" value={l.qty || ''} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td className="pr-2 text-right">{s ? money(s.avgRate) : ''}</td>
              <td><Button variant="danger" className="px-2" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</Button></td></tr>); })}</tbody></table></div>
      </Section>
    </div>
  );
}

// ---------- shared detail ----------
function TransferDetail({ kind, id }: { kind: 'stock' | 'product'; id: string }) {
  const nav = useNavigate();
  const path = kind === 'stock' ? 'inventory/transfers' : 'inventory/product-transfers';
  const q = useQuery({ queryKey: [path, id], queryFn: () => http.get<STRow & { notes: string | null; items: { id: string; qty: number; pcs: number; unitPrice: number; total: number; variant?: V; fromVariant?: V; toVariant?: V }[] }>(`/${path}/${id}`) });
  const d = q.data; if (!d) return <p className="text-ink-muted">Loading…</p>;
  const name = (v?: V) => v ? `${v.productName} · ${v.variantName}` : '';
  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{d.docNo} <Badge tone="green">{d.status}</Badge></h1><Button variant="secondary" onClick={() => nav(-1)}>Back</Button></div>
      <Section title="Details">
        <div><div className="label">{kind === 'stock' ? 'From' : 'Firm / Branch'}</div>{d.firmName} / {d.branchName}</div>
        {kind === 'stock' && <div><div className="label">To</div>{d.toFirmName} / {d.toBranchName}</div>}
        <div><div className="label">Date</div>{d.date}</div><div><div className="label">Reference</div>{d.referenceNo ?? '—'}</div><div className="md:col-span-2"><div className="label">Notes</div>{d.notes ?? '—'}</div>
      </Section>
      <section className="card"><table className="w-full"><thead className="text-xs text-ink-muted"><tr><th className="text-left px-5 py-2">{kind === 'stock' ? 'Product' : 'From → To'}</th><th className="text-right px-5">Pcs</th><th className="text-right px-5">Qty</th><th className="text-right px-5">Unit Price</th><th className="text-right px-5">Total</th></tr></thead>
        <tbody>{d.items.map((it) => <tr key={it.id} className="border-t border-line"><td className="px-5 py-2">{kind === 'stock' ? name(it.variant) : `${name(it.fromVariant)} → ${name(it.toVariant)}`}</td><td className="px-5 text-right">{it.pcs}</td><td className="px-5 text-right">{it.qty}</td><td className="px-5 text-right">{money(it.unitPrice)}</td><td className="px-5 text-right">{money(it.total)}</td></tr>)}
          <tr className="border-t-2 border-line font-semibold"><td className="px-5 py-2" colSpan={4}>Total</td><td className="px-5 text-right">{money(d.totalValue)}</td></tr></tbody></table></section>
      <JournalSection sourceType={kind === 'stock' ? 'stock_transfer' : 'product_transfer'} sourceId={id} />
    </div>
  );
}
