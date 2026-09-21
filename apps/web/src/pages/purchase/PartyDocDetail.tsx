import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { amountInWords } from '@erp/shared';
import { http } from '../../api/client';
import { Badge, Button } from '../../components/ui';
import { errorText } from '../../components/form/Section';
import { JournalSection } from '../../components/doc/JournalSection';
import type { PartyDocConfig } from './PartyDocForm';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TONE: Record<string, 'gray' | 'blue' | 'green' | 'orange' | 'red'> = { draft: 'orange', open: 'blue', partial: 'orange', paid: 'green', billed: 'green', confirmed: 'blue', closed: 'green', cancelled: 'red' };

interface Doc { id: string; docNo: string; status: string; date: string; dueDate?: string | null; contactName: string; firmName?: string; vendorBillNo?: string | null; reason?: string | null; placeOfSupply: string | null; interstate: boolean;
  currency?: { symbol: string }; subtotal: number; discountTotal: number; taxTotal: number; withholdingAmount: number; withholdingType: string; shippingCharges?: number; adjustment: number; roundOff: number; grandTotal: number; paidAmount?: number; balance?: number; printableNotes: string | null;
  items: { id: string; variant?: { productName: string; variantName: string; sku: string }; hsnSac: string | null; description: string | null; pcs: number; qty: number; rate: number; discount: number; taxRatePct: number; tax: number; amount: number }[] }

/** Document view: printable-style header, items, totals, amount in words, journal; actions delete / record payment. */
export type { Doc as PartyDoc };
export function PartyDocDetail({ cfg, extra, actions }: { cfg: PartyDocConfig; extra?: (d: Doc) => React.ReactNode; actions?: (d: Doc) => React.ReactNode }) {
  const { id } = useParams(); const nav = useNavigate(); const qc = useQueryClient();
  const q = useQuery({ queryKey: [cfg.api, id], queryFn: () => http.get<Doc>(`/${cfg.api}/${id}`), enabled: !!id });
  const d = q.data; if (!d) return <p className="text-ink-muted">{q.error ? errorText(q.error) : 'Loading…'}</p>;
  const sym = d.currency?.symbol ?? '';
  const remove = async () => { if (!confirm(`Delete ${d.docNo}?`)) return; try { await http.del(`/${cfg.api}/${d.id}`); await qc.invalidateQueries({ queryKey: [cfg.api] }); nav(cfg.listPath); } catch (e) { alert(errorText(e)); } };

  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{d.docNo} <Badge tone={TONE[d.status] ?? 'gray'}>{d.status.toUpperCase()}</Badge></h1>
        <div className="flex gap-2">
          {actions?.(d)}
          {cfg.actions?.recordPayment && ['open', 'partial'].includes(d.status) && <Button onClick={() => nav(`${cfg.actions!.recordPayment}?contactId=${(d as unknown as { contactId: string }).contactId}`)}>$ Record Payment</Button>}
          {cfg.actions?.note && d.status !== 'draft' && <Button variant="secondary" onClick={() => nav(`${cfg.actions!.note}?contactId=${(d as unknown as { contactId: string }).contactId}&${cfg.docType === 'invoice' ? 'invoiceId' : 'billId'}=${d.id}`)}>{cfg.docType === 'invoice' ? 'Credit Note' : 'Debit Note'}</Button>}
          <Button variant="secondary" onClick={() => nav(cfg.listPath)}>Back</Button><Button variant="danger" onClick={remove}>Delete</Button>
        </div>
      </div>
      <section className="card p-8">
        <div className="flex justify-between mb-6"><div><div className="font-semibold">{d.firmName}</div></div>
          <div className="text-right"><div className="text-2xl font-bold text-red-600 tracking-wide uppercase">{cfg.title}</div>
            <table className="text-sm mt-2 ml-auto"><tbody>
              <tr><td className="pr-4 font-medium">{cfg.numberLabel}</td><td>{d.docNo}</td></tr><tr><td className="pr-4 font-medium">Date</td><td>{d.date}</td></tr>
              {d.vendorBillNo && <tr><td className="pr-4 font-medium">PO Number</td><td>{d.vendorBillNo}</td></tr>}{d.dueDate && <tr><td className="pr-4 font-medium">Due Date</td><td>{d.dueDate}</td></tr>}
              {d.placeOfSupply && <tr><td className="pr-4 font-medium">Place of Supply</td><td>{d.placeOfSupply}</td></tr>}</tbody></table></div></div>
        <div className="border-t-2 border-red-600 pt-3 mb-4"><div className="text-xs text-ink-muted uppercase">{cfg.party === 'vendor' ? 'Vendor' : 'Bill To'}</div><div className="font-semibold text-lg">{d.contactName}</div>{d.reason && <div className="text-ink-muted">Reason: {d.reason}</div>}</div>
        <table className="w-full text-sm"><thead className="bg-red-600 text-white text-xs"><tr>{['#', 'Item', 'HSN/SAC', 'Description', 'Pcs', 'Qty', 'Rate', 'Discount', 'Tax %', 'Tax Amt', 'Amount'].map((c, i) => <th key={c} className={`px-2 py-1 ${i > 3 ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
          <tbody>{d.items.map((it, i) => <tr key={it.id} className="border-b border-line"><td className="px-2 py-1">{i + 1}</td><td className="px-2 py-1">{it.variant?.productName} <span className="text-ink-muted">· {it.variant?.variantName}</span></td><td className="px-2 py-1">{it.hsnSac ?? ''}</td><td className="px-2 py-1">{it.description ?? ''}</td><td className="px-2 py-1 text-right">{it.pcs}</td><td className="px-2 py-1 text-right">{it.qty}</td><td className="px-2 py-1 text-right">{money(it.rate)}</td><td className="px-2 py-1 text-right">{money(it.discount)}</td><td className="px-2 py-1 text-right">{it.taxRatePct}%</td><td className="px-2 py-1 text-right">{money(it.tax)}</td><td className="px-2 py-1 text-right font-medium">{money(it.amount)}</td></tr>)}</tbody></table>
        <div className="flex justify-end mt-4"><table className="text-sm w-72"><tbody>
          <Tr l="Subtotal" v={`${sym}${money(d.subtotal)}`} />{d.discountTotal > 0 && <Tr l="Discount" v={`−${sym}${money(d.discountTotal)}`} />}{d.taxTotal > 0 && <Tr l={d.interstate ? 'IGST' : 'CGST + SGST'} v={`${sym}${money(d.taxTotal)}`} />}
          {!!d.withholdingAmount && <Tr l={d.withholdingType.toUpperCase()} v={`${sym}${money(d.withholdingAmount)}`} />}{!!d.shippingCharges && <Tr l="Shipping" v={`${sym}${money(d.shippingCharges)}`} />}{!!d.adjustment && <Tr l="Adjustment" v={`${sym}${money(d.adjustment)}`} />}{!!d.roundOff && <Tr l="Round Off" v={`${sym}${money(d.roundOff)}`} />}
          <tr className="border-t-2 border-ink font-bold text-base"><td className="py-2">Grand Total</td><td className="py-2 text-right">{sym}{money(d.grandTotal)}</td></tr>
          {d.paidAmount !== undefined && <><Tr l="Paid Amount" v={`(−) ${sym}${money(d.paidAmount)}`} /><tr className="font-semibold"><td>Remaining Amount</td><td className="text-right">{sym}{money(d.balance ?? 0)}</td></tr></>}
        </tbody></table></div>
        <p className="mt-3 text-right italic text-ink-muted text-sm">{amountInWords(d.grandTotal)}</p>
        {d.printableNotes && <p className="mt-6 text-sm text-ink-muted border-t border-line pt-3">{d.printableNotes}</p>}
        <div className="mt-10 text-right text-sm"><div className="inline-block border-t border-ink pt-1 px-6">Authorized Signatory</div></div>
      </section>
      {extra?.(d)}
      <JournalSection sourceType={cfg.docType} sourceId={d.id} />
    </div>
  );
}
const Tr = ({ l, v }: { l: string; v: string }) => <tr><td className="py-0.5">{l}</td><td className="py-0.5 text-right tabular-nums">{v}</td></tr>;
