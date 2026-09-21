import { useState } from 'react';
import { calcLine, type TransactionLineInput } from '@erp/shared';
import { useAccounts, useTaxRates, useUnits } from '../../api/lookups';
import type { VariantOption } from '../../api/inventory';
import { Button, Input, Select } from '../ui';
import { VariantPicker } from './VariantPicker';

export interface GridLine extends TransactionLineInput { variant?: VariantOption | null; key: string }
export const newLine = (): GridLine => ({ key: Math.random().toString(36).slice(2), variantId: '', pcs: 0, qty: 0, rate: 0, discountType: 'flat', discountValue: 0, taxRateId: null });

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Transaction line grid: Product/Sub Product, Pcs, Qty, Rate, Discount (Flat/%), Tax, Amount;
 * expand → HSN/SAC, Unit, Description (+ Account for debit/credit notes). Bulk Action sets one field on every line.
 */
export function LineGrid({ lines, onChange, taxType, priceSource, showAccount, stockOf, firmId }: {
  lines: GridLine[]; onChange: (l: GridLine[]) => void; taxType: 'exclusive' | 'inclusive'; priceSource: 'purchase' | 'selling';
  showAccount?: boolean; stockOf?: (variantId: string) => number | undefined; firmId?: string;
}) {
  const taxes = useTaxRates(); const units = useUnits(); const accounts = useAccounts({ firmId, postable: true });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ field: 'discount' | 'tax'; discountType: 'flat' | 'percent'; value: string } | null>(null);
  const set = (key: string, patch: Partial<GridLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pct = (id?: string | null) => { const t = taxes.data?.find((x) => x.id === id); return t && t.type === 'gst' ? Number(t.rate) : 0; };
  const amt = (l: GridLine) => calcLine({ qty: l.qty, rate: l.rate, discountType: l.discountType, discountValue: l.discountValue, taxRatePct: pct(l.taxRateId) }, taxType);
  const locked = (l: GridLine) => l.variant && ['certified', 'jewellery'].includes(l.variant.stockType);

  const applyBulk = () => {
    if (!bulk) return;
    onChange(lines.map((l) => (bulk.field === 'discount' ? { ...l, discountType: bulk.discountType, discountValue: Number(bulk.value) } : { ...l, taxRateId: bulk.value || null })));
    setBulk(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="text-xs uppercase tracking-wide text-ink-muted bg-canvas"><tr>
          <th className="w-8" /><th className="text-left px-2 py-2 w-10">Sr</th><th className="text-left px-2 min-w-[260px]">Product / Sub Product *</th><th className="text-right px-2 w-20">Pcs</th><th className="text-right px-2 w-24">Qty *</th><th className="text-right px-2 w-28">Rate *</th><th className="text-left px-2 w-40">Discount</th><th className="text-left px-2 w-40">Tax *</th><th className="text-right px-2 w-28">Amount</th><th className="w-8" /></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const a = amt(l); const stock = l.variantId ? stockOf?.(l.variantId) : undefined;
            return (
              <FragmentRow key={l.key}>
                <tr className="border-t border-line align-top">
                  <td className="pt-3 text-center"><button className="text-ink-faint" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(l.key) ? n.delete(l.key) : n.add(l.key); return n; })}>{expanded.has(l.key) ? '▾' : '▸'}</button></td>
                  <td className="px-2 pt-3 text-ink-muted">{i + 1}</td>
                  <td className="px-2 py-1.5"><VariantPicker value={l.variant ?? null} onSelect={(v) => set(l.key, { variant: v, variantId: v.variantId, rate: l.rate || (priceSource === 'purchase' ? v.purchasePrice : v.sellingPrice), pcs: ['certified', 'jewellery'].includes(v.stockType) ? 1 : l.pcs, hsnSac: null, unitId: v.unitId })} />
                    {stock !== undefined && <div className="text-xs text-ink-muted mt-0.5">Stock: {stock}</div>}</td>
                  <td className="px-2 py-1.5"><Input type="number" className="text-right" value={l.pcs || ''} disabled={!!locked(l)} onChange={(e) => set(l.key, { pcs: Number(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><Input type="number" step="any" className="text-right" value={l.qty || ''} onChange={(e) => set(l.key, { qty: Number(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><Input type="number" step="any" className="text-right" value={l.rate || ''} onChange={(e) => set(l.key, { rate: Number(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><div className="flex"><Select className="w-16 rounded-r-none" value={l.discountType} onChange={(e) => set(l.key, { discountType: e.target.value as 'flat' })}><option value="flat">Flat</option><option value="percent">%</option></Select><Input type="number" step="any" className="rounded-l-none text-right" value={l.discountValue || ''} onChange={(e) => set(l.key, { discountValue: Number(e.target.value) })} /></div></td>
                  <td className="px-2 py-1.5"><Select value={l.taxRateId ?? ''} onChange={(e) => set(l.key, { taxRateId: e.target.value || null })}><option value="">Tax</option>{taxes.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></td>
                  <td className="px-2 pt-3 text-right tabular-nums font-medium">{money(a.amount)}</td>
                  <td className="pt-3 text-center"><button className="text-red-500" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} aria-label="Remove">🗑</button></td>
                </tr>
                {expanded.has(l.key) && (
                  <tr className="bg-canvas/50"><td colSpan={10} className="px-4 py-3"><div className="grid gap-3 md:grid-cols-4">
                    <div><div className="label">HSN/SAC</div><Input value={l.hsnSac ?? ''} placeholder="Search HSN…" onChange={(e) => set(l.key, { hsnSac: e.target.value })} /></div>
                    <div><div className="label">Unit</div><Select value={l.unitId ?? ''} onChange={(e) => set(l.key, { unitId: e.target.value || null })}><option value="">Search unit…</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</Select></div>
                    {showAccount && <div><div className="label req">Account</div><Select value={l.accountId ?? ''} onChange={(e) => set(l.key, { accountId: e.target.value || null })}><option value="">Product default</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>}
                    <div className={showAccount ? '' : 'md:col-span-2'}><div className="label">Description</div><Input value={l.description ?? ''} placeholder="Add description…" onChange={(e) => set(l.key, { description: e.target.value })} /></div>
                  </div></td></tr>
                )}
              </FragmentRow>
            );
          })}
          <tr className="border-t border-line"><td colSpan={8} className="px-2 py-2 text-right font-medium">Total</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{money(lines.reduce((s, l) => s + amt(l).amount, 0))}</td><td /></tr>
        </tbody>
      </table>
      <div className="flex items-center gap-4 px-2 py-3 text-brand">
        <button className="font-medium" onClick={() => onChange([...lines, newLine()])}>+ Add New Item</button>
        <button className="font-medium" onClick={() => setBulk({ field: 'discount', discountType: 'flat', value: '' })}>≡ Bulk Action</button>
      </div>
      {bulk && (
        <div className="card p-4 grid gap-3 max-w-md">
          <div className="font-semibold">Bulk Action <span className="text-ink-muted font-normal text-xs">Set one field on every line item</span></div>
          <Select value={bulk.field} onChange={(e) => setBulk({ ...bulk, field: e.target.value as 'discount', value: '' })}><option value="discount">Discount</option><option value="tax">Tax</option></Select>
          {bulk.field === 'discount' ? <div className="flex"><Select className="w-20 rounded-r-none" value={bulk.discountType} onChange={(e) => setBulk({ ...bulk, discountType: e.target.value as 'flat' })}><option value="flat">Flat</option><option value="percent">%</option></Select><Input type="number" className="rounded-l-none" placeholder="Value" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} /></div>
            : <Select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })}><option value="">Select tax</option>{taxes.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button><Button onClick={applyBulk}>Apply</Button></div>
        </div>
      )}
    </div>
  );
}
const FragmentRow = ({ children }: { children: React.ReactNode }) => <>{children}</>;
