import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../api/client';
import { useSeriesFor, useSeriesPreview } from '../../api/inventory';
import { Button, Checkbox, Input, Modal, Select } from '../../components/ui';
import { errorText } from '../../components/form/Section';
import { today } from '../../components/doc/DocHeader';
import type { PartyDoc } from '../purchase/PartyDocDetail';

interface SoItem { id: string; variant?: { productName: string; variantName: string; sku: string }; qty: number; pcs: number; invoicedQty: number; returnedQty: number; lossQty: number; pendingQty: number; pendingPcs: number }

/** "Return Stock" screen of a memo: per line return / loss, then Return or Return & Convert to Invoice. */
export function ReturnStockModal({ order, onClose }: { order: PartyDoc; onClose: () => void }) {
  const nav = useNavigate(); const qc = useQueryClient();
  type SO = Omit<PartyDoc, 'items'> & { firmId: string; branchId: string; contactId: string; items: SoItem[] };
  const o = order as unknown as SO;
  const so = useQuery({ queryKey: ['sales/orders', o.id], queryFn: () => http.get<SO>(`/sales/orders/${o.id}`) });
  const items: SoItem[] = so.data?.items ?? o.items;
  const series = useSeriesFor('sales_order_return', o.firmId, o.branchId);
  const [seriesId, setSeriesId] = useState('');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Record<string, { returnQty: number; returnPcs: number; lossQty: number; lossPcs: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const preview = useSeriesPreview(seriesId, date);
  useEffect(() => { if (series.data && !seriesId) setSeriesId(series.data.find((s) => s.isDefault)?.id ?? series.data[0]?.id ?? ''); }, [series.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = (id: string) => rows[id] ?? { returnQty: 0, returnPcs: 0, lossQty: 0, lossPcs: 0 };
  const set = (id: string, p: Partial<ReturnType<typeof g>>) => setRows((s) => ({ ...s, [id]: { ...g(id), ...p } }));
  const all = (v: boolean) => setRows(v ? Object.fromEntries(items.map((i) => [i.id, { returnQty: i.pendingQty, returnPcs: i.pendingPcs, lossQty: 0, lossPcs: 0 }])) : {});

  const submit = async (convert: boolean) => {
    setError(null);
    const list = items.filter((i) => g(i.id).returnQty > 0 || g(i.id).lossQty > 0).map((i) => ({ salesOrderItemId: i.id, ...g(i.id) }));
    if (!list.length && !convert) { setError('Enter a return or loss quantity'); return; }
    try {
      if (list.length) await http.post('/sales/order-returns', { salesOrderId: o.id, seriesId, date, items: list });
      await qc.invalidateQueries({ queryKey: ['sales/orders'] });
      if (convert) nav(`/accounting/sales/invoices/new?contactId=${o.contactId}&fromOrder=${o.id}`); else onClose();
    } catch (e) { setError(errorText(e)); }
  };

  return (
    <Modal open title="Return Stock" subtitle={`${o.docNo} · ${o.contactName}`} onClose={onClose} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => submit(false)}>Return</Button><Button onClick={() => submit(true)}>Return & Convert to Invoice</Button></>}>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
      <div className="grid md:grid-cols-3 gap-4 items-end">
        <div><div className="flex justify-between"><label className="label req">Series</label>{preview.data && <span className="text-xs text-ink-muted">Preview: <b className="text-ink">{preview.data.docNo}</b></span>}</div><Select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>{series.data?.map((s) => <option key={s.id} value={s.id}>{s.prefix}</option>)}</Select></div>
        <div><label className="label">Return Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Checkbox label="All Return Stock" checked={items.length > 0 && items.every((i) => g(i.id).returnQty === i.pendingQty)} onChange={(e) => all(e.target.checked)} />
      </div>
      <table className="w-full text-sm"><thead className="text-xs uppercase text-ink-muted"><tr><th className="text-left px-2 py-2">Issue Product</th><th className="text-right px-2">Issue Qty</th><th className="text-right px-2">Pcs</th><th className="text-right px-2">Loss Qty</th><th className="text-right px-2">Return Qty</th><th className="text-right px-2">Sales Qty</th><th className="text-right px-2">Pending Qty</th></tr></thead>
        <tbody>{items.map((i) => { const r = g(i.id); const pending = i.pendingQty - r.returnQty - r.lossQty; return (
          <tr key={i.id} className="border-t border-line"><td className="px-2 py-2"><div className="font-medium">{i.variant?.productName} · {i.variant?.variantName}</div><div className="text-xs text-ink-muted">{i.variant?.sku}</div></td>
            <td className="px-2 text-right">{i.qty}</td>
            <td className="px-2"><Input type="number" className="w-20 h-9 text-right" value={r.returnPcs || ''} onChange={(e) => set(i.id, { returnPcs: Number(e.target.value) })} /></td>
            <td className="px-2"><Input type="number" step="any" className="w-24 h-9 text-right" value={r.lossQty || ''} onChange={(e) => set(i.id, { lossQty: Math.min(Number(e.target.value), i.pendingQty - r.returnQty), lossPcs: Number(e.target.value) ? r.lossPcs || 1 : 0 })} /></td>
            <td className="px-2"><Input type="number" step="any" className="w-24 h-9 text-right" value={r.returnQty || ''} onChange={(e) => set(i.id, { returnQty: Math.min(Number(e.target.value), i.pendingQty - r.lossQty) })} /></td>
            <td className="px-2 text-right">{i.invoicedQty}</td><td className={`px-2 text-right font-medium ${pending < 0 ? 'text-red-600' : ''}`}>{pending}</td></tr>); })}</tbody></table>
    </Modal>
  );
}
