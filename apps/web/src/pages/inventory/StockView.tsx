import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '../../api/client';
import { useHistory, useLots, useStock, type StockRow } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Checkbox, Input, Modal, Select } from '../../components/ui';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STOCK_TYPES = ['all', 'general', 'loose_diamond', 'metal', 'stone', 'certified', 'jewellery'];

export function StockViewPage() {
  const { firm, firms } = useAuth();
  const [firmId, setFirmId] = useState(firm?.id ?? '');
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [stockType, setStockType] = useState('all');
  const [modal, setModal] = useState<{ kind: 'history' | 'lots'; row: StockRow } | null>(null);
  const stock = useStock({ firmId: firmId || undefined, branchId: branchId || undefined, search, hideZero, stockType });
  const rows = stock.data ?? [];
  const branches = firms.find((f) => f.id === firmId)?.branches ?? [];

  const summary = useMemo(() => ({
    items: rows.length, low: rows.filter((r) => r.lowStock).length,
    value: rows.reduce((s, r) => s + r.value, 0), asset: rows.reduce((s, r) => s + r.qty * r.purchasePrice, 0), committed: rows.reduce((s, r) => s + r.soCommitted, 0),
  }), [rows]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4"><h1 className="text-xl font-semibold">Stock View</h1></div>
      <div className="grid gap-3 md:grid-cols-5 mb-4">
        {[['Total Items', summary.items], ['SO Committed Stock', summary.committed], ['Low Stock Items', summary.low], ['Total Stock Value', money(summary.value)], ['Inventory Asset Value', money(summary.asset)]].map(([k, v]) => (
          <div key={String(k)} className="card p-4"><div className="text-ink-muted text-xs">{k}</div><div className="text-xl font-semibold mt-1">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Select className="w-44 h-9" value={firmId} onChange={(e) => { setFirmId(e.target.value); setBranchId(''); }}><option value="">All Firms</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        <Select className="w-40 h-9" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">All Branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        <Select className="w-40 h-9" value={stockType} onChange={(e) => setStockType(e.target.value)}>{STOCK_TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All Products' : t.replace(/_/g, ' ')}</option>)}</Select>
        <Checkbox label="Remove Zero Stock" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
        <Input className="max-w-xs h-9" placeholder="Search product, SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="text-xs uppercase tracking-wide text-ink-muted bg-canvas"><tr>
            {['Product', 'Sub Product', 'SKU', 'Unit', 'Total In', 'Total Out', 'Pcs', 'Current Qty', 'SO Committed', 'PO Committed', 'Saleable Qty', 'Current Value', 'Inventory Asset Value', 'Avg Rate', 'Purchase Price', 'Selling Price', ''].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {stock.isLoading && <tr><td colSpan={17} className="px-4 py-8 text-center text-ink-muted">Loading…</td></tr>}
            {rows.map((r) => (
              <tr key={r.variantId} className="border-t border-line hover:bg-canvas/60">
                <td className="px-3 py-2 font-medium">{r.productName}</td><td className="px-3 py-2">{r.variantName}</td><td className="px-3 py-2"><code className="text-xs">{r.sku}</code></td><td className="px-3 py-2">{r.unit ?? ''}</td>
                <td className="px-3 py-2 text-right">{r.totalIn}</td><td className="px-3 py-2 text-right">{r.totalOut}</td><td className="px-3 py-2 text-right">{r.pcs}</td>
                <td className={`px-3 py-2 text-right font-medium ${r.qty < 0 ? 'text-red-600' : ''}`}>{r.qty} {r.lowStock && <Badge tone="orange">Low</Badge>}</td>
                <td className="px-3 py-2 text-right">{r.soCommitted}</td><td className="px-3 py-2 text-right">{r.poCommitted}</td><td className="px-3 py-2 text-right">{r.saleableQty}</td>
                <td className="px-3 py-2 text-right">{money(r.value)}</td><td className="px-3 py-2 text-right">{money(r.qty * r.purchasePrice)}</td><td className="px-3 py-2 text-right">{money(r.avgRate)}</td>
                <td className="px-3 py-2 text-right">{money(r.purchasePrice)}</td><td className="px-3 py-2 text-right">{money(r.sellingPrice)}</td>
                <td className="px-3 py-2 text-right"><Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setModal({ kind: 'history', row: r })}>History</Button><Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setModal({ kind: 'lots', row: r })}>FIFO</Button></td>
              </tr>
            ))}
            {!stock.isLoading && rows.length > 0 && (
              <tr className="border-t-2 border-line font-semibold bg-canvas/50"><td className="px-3 py-2" colSpan={7}>Total</td>
                <td className="px-3 py-2 text-right">{rows.reduce((s, r) => s + r.qty, 0)}</td><td colSpan={3} /><td className="px-3 py-2 text-right">{money(summary.value)}</td><td className="px-3 py-2 text-right">{money(summary.asset)}</td><td colSpan={4} /></tr>
            )}
          </tbody>
        </table>
      </div>
      {modal?.kind === 'history' && <HistoryModal row={modal.row} branchId={branchId} onClose={() => setModal(null)} />}
      {modal?.kind === 'lots' && <LotsModal row={modal.row} branchId={branchId} onClose={() => setModal(null)} />}
    </div>
  );
}

function HistoryModal({ row, branchId, onClose }: { row: StockRow; branchId: string; onClose: () => void }) {
  const h = useHistory({ variantId: row.variantId, branchId: branchId || undefined });
  return (
    <Modal open title="Product History" subtitle={`${row.productName} · ${row.variantName} (${row.sku})`} onClose={onClose} wide>
      <div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap text-[13px]">
        <thead className="text-xs text-ink-muted"><tr>{['Date', 'Branch', 'Contact', 'Document', 'In Qty', 'In Pcs', 'In Rate', 'Out Qty', 'Out Pcs', 'Out Rate', 'Value', 'Qty', 'Pcs'].map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead>
        <tbody>{h.data?.map((m) => (
          <tr key={m.id} className="border-t border-line"><td className="px-2 py-1">{m.date}</td><td className="px-2 py-1">{m.branchName}</td><td className="px-2 py-1">{m.contactName ?? ''}</td><td className="px-2 py-1 text-brand">{m.docNo}<span className="text-ink-muted text-xs"> {m.note ?? ''}</span></td>
            <td className="px-2 py-1 text-right">{m.direction === 'in' ? m.qty : ''}</td><td className="px-2 py-1 text-right">{m.direction === 'in' ? m.pcs : ''}</td><td className="px-2 py-1 text-right">{m.direction === 'in' ? money(m.rate) : ''}</td>
            <td className="px-2 py-1 text-right">{m.direction === 'out' ? m.qty : ''}</td><td className="px-2 py-1 text-right">{m.direction === 'out' ? m.pcs : ''}</td><td className="px-2 py-1 text-right">{m.direction === 'out' ? money(m.rate) : ''}</td>
            <td className="px-2 py-1 text-right">{money(m.value)}</td><td className={`px-2 py-1 text-right font-medium ${m.runningQty < 0 ? 'text-red-600' : ''}`}>{m.runningQty}</td><td className="px-2 py-1 text-right">{m.runningPcs}</td></tr>))}
          {h.data?.length === 0 && <tr><td colSpan={13} className="px-2 py-6 text-center text-ink-muted">No movements yet</td></tr>}</tbody></table></div>
    </Modal>
  );
}

function LotsModal({ row, branchId, onClose }: { row: StockRow; branchId: string; onClose: () => void }) {
  const l = useLots({ variantId: row.variantId, branchId: branchId || undefined });
  return (
    <Modal open title="FIFO Tracking" subtitle={`${row.productName} · ${row.variantName} — open cost layers, oldest consumed first`} onClose={onClose} wide>
      <table className="w-full text-left text-[13px]"><thead className="text-xs text-ink-muted"><tr>{['Received', 'Branch', 'Document', 'Qty In', 'Remaining', 'Pcs In', 'Pcs Left', 'Rate', 'Value'].map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead>
        <tbody>{l.data?.map((x) => <tr key={x.id} className={`border-t border-line ${x.qtyRemaining === 0 ? 'text-ink-faint' : ''}`}><td className="px-2 py-1">{x.receivedAt}</td><td className="px-2 py-1">{x.branchName}</td><td className="px-2 py-1 text-brand">{x.docNo}</td><td className="px-2 py-1 text-right">{x.qtyIn}</td><td className="px-2 py-1 text-right font-medium">{x.qtyRemaining}</td><td className="px-2 py-1 text-right">{x.pcsIn}</td><td className="px-2 py-1 text-right">{x.pcsRemaining}</td><td className="px-2 py-1 text-right">{money(x.rate)}</td><td className="px-2 py-1 text-right">{money(x.value)}</td></tr>)}
          {l.data?.length === 0 && <tr><td colSpan={9} className="px-2 py-6 text-center text-ink-muted">No lots</td></tr>}</tbody></table>
    </Modal>
  );
}

export function BranchStockPage() {
  const { firm, firms } = useAuth();
  const [firmId, setFirmId] = useState(firm?.id ?? '');
  const q = useQuery({ queryKey: ['stock-by-branch', firmId], queryFn: () => http.get<{ branches: { id: string; name: string }[]; rows: { id: string; productName: string; variantName: string; sku: string; byBranch: Record<string, number>; total: number }[] }>('/inventory/stock/by-branch', { firmId: firmId || undefined }) });
  return (
    <div>
      <div className="flex items-center justify-between mb-4"><h1 className="text-xl font-semibold">Branch Wise Stock View</h1>
        <Select className="w-48 h-9" value={firmId} onChange={(e) => setFirmId(e.target.value)}><option value="">All Firms</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></div>
      <div className="card overflow-x-auto"><table className="w-full text-left"><thead className="text-xs uppercase text-ink-muted bg-canvas"><tr><th className="px-3 py-3">Product / Sub Product</th>{q.data?.branches.map((b) => <th key={b.id} className="px-3 py-3 text-right">{b.name}</th>)}<th className="px-3 py-3 text-right">Total</th></tr></thead>
        <tbody>{q.data?.rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="px-3 py-2">{r.productName} <span className="text-ink-muted">· {r.variantName}</span></td>{q.data.branches.map((b) => <td key={b.id} className={`px-3 py-2 text-right ${(r.byBranch[b.id] ?? 0) < 0 ? 'text-red-600' : ''}`}>{r.byBranch[b.id] ?? 0}</td>)}<td className="px-3 py-2 text-right font-medium">{r.total}</td></tr>)}
          {q.data?.rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-ink-muted">No stock yet</td></tr>}</tbody></table></div>
    </div>
  );
}
