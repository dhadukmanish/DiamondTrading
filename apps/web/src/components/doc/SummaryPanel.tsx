import type { Totals } from '@erp/shared';
import { Input, Select } from '../ui';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Right-hand totals card: Subtotal, TDS/TCS, Shipping, Adjustment, Round Off, Grand Total. */
export function SummaryPanel({ totals, currency, withholding, onWithholding, adjustment, onAdjustment, shipping, onShipping, showRoundOff }: {
  totals: Totals; currency: string;
  withholding: { type: 'none' | 'tds' | 'tcs'; rate: number }; onWithholding: (w: { type: 'none' | 'tds' | 'tcs'; rate: number }) => void;
  adjustment: number; onAdjustment: (n: number) => void; shipping?: number; onShipping?: (n: number) => void; showRoundOff?: boolean;
}) {
  const rates = [0.1, 1, 2, 5, 10];
  const toggle = (t: 'tds' | 'tcs') => onWithholding({ type: withholding.type === t ? 'none' : t, rate: withholding.rate });
  return (
    <section className="card">
      <div className="px-5 py-3 border-b border-line text-[13px] font-semibold tracking-wide text-ink-muted">Summary</div>
      <div className="p-5 grid gap-3">
        <Row label="Subtotal">{money(totals.subtotal)}</Row>
        {totals.discountTotal > 0 && <Row label="Discount"><span className="text-ink-muted">−{money(totals.discountTotal)}</span></Row>}
        {totals.taxTotal > 0 && <Row label="Tax"><span className="text-ink-muted">{money(totals.taxTotal)}</span></Row>}
        {onShipping && <Row label="Shipping Charges"><Input type="number" step="any" className="w-28 h-9 text-right" value={shipping || ''} onChange={(e) => onShipping(Number(e.target.value))} /></Row>}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-md border border-line overflow-hidden text-sm">
            {(['tds', 'tcs'] as const).map((t) => <button key={t} onClick={() => toggle(t)} className={`px-3 py-1.5 uppercase ${withholding.type === t ? 'bg-brand-soft text-brand font-semibold' : 'text-ink-muted'}`}>{t}</button>)}
          </div>
          <div className="flex items-center gap-2">
            <Select className="w-32 h-9" value={withholding.rate} disabled={withholding.type === 'none'} onChange={(e) => onWithholding({ ...withholding, rate: Number(e.target.value) })}><option value={0}>Select rate…</option>{rates.map((r) => <option key={r} value={r}>{r}%</option>)}</Select>
            <span className={`tabular-nums w-24 text-right ${totals.withholding < 0 ? 'text-red-600' : ''}`}>{totals.withholding < 0 ? '- ' : ''}{money(Math.abs(totals.withholding))}</span>
          </div>
        </div>
        <Row label="Adjustment"><Input type="number" step="any" className="w-28 h-9 text-right" value={adjustment || ''} onChange={(e) => onAdjustment(Number(e.target.value))} /></Row>
        {showRoundOff && <Row label="Round Off"><span className="text-ink-muted">{money(totals.roundOff)}</span></Row>}
      </div>
      <div className="flex items-center justify-between bg-brand text-white px-5 py-4 rounded-b-lg"><span className="font-bold tracking-wide">GRAND TOTAL</span><span className="text-2xl font-bold tabular-nums">{currency}{money(totals.grandTotal)}</span></div>
    </section>
  );
}
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="flex items-center justify-between"><span>{label}</span><span className="tabular-nums">{children}</span></div>;
