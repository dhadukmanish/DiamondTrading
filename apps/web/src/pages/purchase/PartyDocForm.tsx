import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { calcLine, calcTotals, type Totals } from '@erp/shared';
import type { ZodTypeAny } from 'zod';
import { http } from '../../api/client';
import { useSave } from '../../api/hooks';
import { useStock } from '../../api/inventory';
import { useCurrencies, usePaymentTerms, useSalesPersons, useTaxRates, type ContactOption } from '../../api/lookups';
import { useAuth } from '../../auth/AuthContext';
import { Button, Checkbox, Field, Input, Modal, Select } from '../../components/ui';
import { Section, FormErrors, errorText } from '../../components/form/Section';
import { DocHeader, today, type DocHeaderValues } from '../../components/doc/DocHeader';
import { PartySelect } from '../../components/doc/PartySelect';
import { LineGrid, newLine, type GridLine } from '../../components/doc/LineGrid';
import { SummaryPanel } from '../../components/doc/SummaryPanel';

export interface PartyDocConfig {
  docType: string; title: string; numberLabel: string; api: string; listPath: string; party: 'vendor' | 'customer';
  schema: ZodTypeAny; priceSource: 'purchase' | 'selling';
  statuses: { value: string; label: string }[];         // e.g. Draft / Open
  fields?: { vendorBillNo?: 'optional' | 'required'; expectedDate?: boolean; salesPerson?: boolean; paymentTerms?: boolean; shipping?: boolean; roundOff?: boolean; printableNotes?: boolean; billLink?: boolean; reason?: boolean; amountOnly?: boolean; lineAccount?: boolean;
    validUntil?: boolean; detailHtml?: boolean; termsConditions?: boolean; consignee?: boolean; invoiceLink?: boolean; openOrders?: 'purchase' | 'sales' };
  /** Detail/extra pages can pass ?fromOrder=<id> to prefill lines from an open order. */
  actions?: { recordPayment?: string; note?: string; convert?: string };
}

interface HeaderState extends DocHeaderValues {
  contactId: string; contact?: ContactOption | null; currencyId: string; exchangeRate: number; taxType: 'exclusive' | 'inclusive';
  withholdingType: 'none' | 'tds' | 'tcs'; withholdingRate: number; adjustment: number; shippingCharges: number; status: string;
  vendorBillNo: string; expectedDate: string; salesPersonId: string; paymentTermsId: string; dueDate: string; purchaseBillId: string; invoiceId: string; reason: string; amountOnly: boolean; validUntil: string; detailHtml: string; termsConditions: string; consigneeContactId: string; consignee?: ContactOption | null; salesOrderIds: string[];
  internalNotes: string; printableNotes: string; notes: string;
}

/** One form for every purchase/sales document; `cfg` decides the extra fields and posting rules. */
export function PartyDocForm({ cfg, extraHeader }: { cfg: PartyDocConfig; extraHeader?: (h: HeaderState, set: (p: Partial<HeaderState>) => void) => ReactNode }) {
  const { firm } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const currencies = useCurrencies(); const taxes = useTaxRates(); const terms = usePaymentTerms(); const salesPersons = useSalesPersons();
  const [h, setH] = useState<HeaderState>({ firmId: firm?.id ?? '', branchId: '', seriesId: '', date: today(), referenceNo: '', contactId: '', currencyId: '', exchangeRate: 1, taxType: 'exclusive',
    withholdingType: 'none', withholdingRate: 0, adjustment: 0, shippingCharges: 0, status: cfg.statuses[cfg.statuses.length - 1]!.value, vendorBillNo: '', expectedDate: '', salesPersonId: '', paymentTermsId: '', dueDate: '', purchaseBillId: sp.get('billId') ?? '', invoiceId: sp.get('invoiceId') ?? '', reason: '', amountOnly: false, validUntil: '', detailHtml: '', termsConditions: '', consigneeContactId: '', salesOrderIds: [], internalNotes: '', printableNotes: '', notes: '' });
  const [lines, setLines] = useState<GridLine[]>([newLine()]);
  const [error, setError] = useState<string | null>(null);
  const save = useSave<{ id: string }>(cfg.api);
  const stock = useStock({ branchId: h.branchId });
  const set = (p: Partial<HeaderState>) => setH((s) => ({ ...s, ...p }));

  useEffect(() => { if (!h.currencyId && currencies.data) set({ currencyId: currencies.data.find((c) => c.code === 'INR')?.id ?? currencies.data[0]?.id ?? '' }); }, [currencies.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Contact defaults: discount → lines, payment terms → due date
  const onContact = (c: ContactOption) => {
    set({ contactId: c.id, contact: c, paymentTermsId: (c as { paymentTermsId?: string }).paymentTermsId ?? '' });
    if (Number(c.discountValue) > 0) setLines((ls) => ls.map((l) => ({ ...l, discountType: c.discountType as 'flat', discountValue: Number(c.discountValue) })));
  };
  useEffect(() => {
    if (!cfg.fields?.paymentTerms) return;
    const days = terms.data?.find((t) => t.id === h.paymentTermsId)?.days ?? 0;
    const d = new Date(h.date); d.setDate(d.getDate() + days); set({ dueDate: d.toISOString().slice(0, 10) });
  }, [h.paymentTermsId, h.date, terms.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const openOrders = useQuery({ queryKey: ['open-orders', f0(cfg), h.contactId], queryFn: () => http.get<OpenLine[]>(`/${f0(cfg) === 'sales' ? 'sales' : 'purchase'}/orders/open/${h.contactId}`), enabled: !!h.contactId && !!f0(cfg) });
  const [pickOpen, setPickOpen] = useState(false);
  const pullLines = (rows: OpenLine[]) => {
    const fresh = rows.filter((o) => !lines.some((l) => l.sourceLineId === o.itemId)).map((o) => ({ ...newLine(), variantId: o.variantId, variant: o.variant ? { ...o.variant, productId: '', stockType: '', unitId: null, purchasePrice: 0, sellingPrice: 0, stock: 0 } as never : null, qty: o.pendingQty, pcs: o.pendingPcs ?? 0, rate: o.rate, taxRateId: o.taxRateId, discountType: o.discountType as 'flat', discountValue: o.discountValue, sourceLineId: o.itemId }));
    setLines((ls) => [...ls.filter((l) => l.variantId), ...fresh]); set({ salesOrderIds: [...new Set([...h.salesOrderIds, ...rows.map((o) => o.orderId)])] });
  };
  const fromOrder = sp.get('fromOrder');
  useEffect(() => { if (fromOrder && openOrders.data) { const rows = openOrders.data.filter((o) => o.orderId === fromOrder); if (rows.length && !lines.some((l) => l.sourceLineId)) pullLines(rows); } }, [openOrders.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const cid = sp.get('contactId'); if (cid && !h.contactId) http.get<ContactOption[]>('/contacts/search', { type: 'all', term: '' }).then((cs) => { const c = cs.find((x) => x.id === cid); if (c) onContact(c); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (id?: string | null) => { const t = taxes.data?.find((x) => x.id === id); return t && t.type === 'gst' ? Number(t.rate) : 0; };
  const totals: Totals = useMemo(() => calcTotals({
    lines: lines.filter((l) => l.variantId).map((l) => calcLine({ qty: l.qty, rate: l.rate, discountType: l.discountType, discountValue: l.discountValue, taxRatePct: pct(l.taxRateId) }, h.taxType)),
    withholdingType: h.withholdingType, withholdingRate: h.withholdingRate, adjustment: h.adjustment, shippingCharges: cfg.fields?.shipping ? h.shippingCharges : 0, roundOff: cfg.fields?.roundOff,
  }), [lines, h.taxType, h.withholdingType, h.withholdingRate, h.adjustment, h.shippingCharges, taxes.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const currency = currencies.data?.find((c) => c.id === h.currencyId);

  const submit = async (status: string) => {
    setError(null);
    const body = { ...h, status, items: lines.filter((l) => l.variantId).map(({ variant, key, ...l }) => ({ ...l, sourceLineId: l.sourceLineId || null })), referenceNo: h.referenceNo || null, vendorBillNo: h.vendorBillNo || null, expectedDate: h.expectedDate || null,
      salesPersonId: h.salesPersonId || null, paymentTermsId: h.paymentTermsId || null, dueDate: h.dueDate || null, purchaseBillId: h.purchaseBillId || null, invoiceId: h.invoiceId || null, reason: h.reason || null, notes: h.notes || null, internalNotes: h.internalNotes || null, printableNotes: h.printableNotes || null,
      validUntil: h.validUntil || null, detailHtml: h.detailHtml || null, termsConditions: h.termsConditions || null, consigneeContactId: h.consigneeContactId || null };
    const parsed = cfg.schema.safeParse(body);
    if (!parsed.success) { setError(parsed.error.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`).join(' · ')); return; }
    try { const d = await save.mutateAsync({ data: parsed.data }); nav(`${cfg.listPath}/${d.id}`); } catch (e) { setError(errorText(e)); }
  };
  const f = cfg.fields ?? {};

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">New {cfg.title}</h1></div>
      <FormErrors error={error} />
      <Section title={`${cfg.title} details`}>
        <DocHeader docType={cfg.docType} numberLabel={cfg.numberLabel} values={h} onChange={set} />
        <Field label={cfg.party === 'vendor' ? 'Vendor' : 'Customer'} required><PartySelect type={cfg.party} value={h.contact} onChange={onContact} /></Field>
        {f.vendorBillNo && <Field label="Order Number" required={f.vendorBillNo === 'required'}><Input value={h.vendorBillNo} placeholder="Enter bill no" onChange={(e) => set({ vendorBillNo: e.target.value })} /></Field>}
        <Field label="Currency & Exchange Rate" required><div className="flex gap-1"><Select className="flex-1" value={h.currencyId} onChange={(e) => set({ currencyId: e.target.value })}>{currencies.data?.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}</Select><Input type="number" step="any" className="w-24" value={h.exchangeRate} onChange={(e) => set({ exchangeRate: Number(e.target.value) })} /></div></Field>
        {f.expectedDate && <Field label="Expected Date"><Input type="date" value={h.expectedDate} onChange={(e) => set({ expectedDate: e.target.value })} /></Field>}
        {f.salesPerson && <Field label="Sales Person"><Select value={h.salesPersonId} onChange={(e) => set({ salesPersonId: e.target.value })}><option value="">Select sales person</option>{salesPersons.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
        {f.paymentTerms && <><Field label="Payment Terms"><Select value={h.paymentTermsId} onChange={(e) => set({ paymentTermsId: e.target.value })}><option value="">Custom</option>{terms.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.days} days)</option>)}</Select></Field>
          <Field label="Due Date"><Input type="date" value={h.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field></>}
        {f.billLink && <BillPicker contactId={h.contactId} value={h.purchaseBillId} onChange={(v) => set({ purchaseBillId: v })} api="purchase/bills" label="Bill No" />}
        {f.invoiceLink && <BillPicker contactId={h.contactId} value={h.invoiceId} onChange={(v) => set({ invoiceId: v })} api="sales/invoices" label="Invoice No" />}
        {f.validUntil && <Field label="Valid Until"><Input type="date" value={h.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></Field>}
        {f.consignee && <Field label="Consignee (Dispatch From)"><PartySelect type="customer" value={h.consignee} onChange={(c) => set({ consigneeContactId: c.id, consignee: c })} /></Field>}
        {f.openOrders && h.salesOrderIds.length > 0 && <Field label={`Linked ${f.openOrders === 'sales' ? 'Sales' : 'Purchase'} Orders`}><Input readOnly value={[...new Set(openOrders.data?.filter((o) => h.salesOrderIds.includes(o.orderId)).map((o) => o.docNo) ?? [])].join(', ')} /></Field>}
        {f.reason && <Field label="Reason"><Input value={h.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>}
        {extraHeader?.(h, set)}
      </Section>

      <Section title="Line items" action={<div className="flex items-center gap-3">
        {f.amountOnly && <Checkbox label="Only Correction in Amount" checked={h.amountOnly} onChange={(e) => set({ amountOnly: e.target.checked })} />}
        <label className="flex items-center gap-2 text-sm"><span className="label req mb-0">Tax Type</span><Select className="w-40 h-9" value={h.taxType} onChange={(e) => set({ taxType: e.target.value as 'exclusive' })}><option value="exclusive">Tax Exclusive</option><option value="inclusive">Tax Inclusive</option></Select></label></div>}>
        <div className="md:col-span-3"><LineGrid lines={lines} onChange={setLines} taxType={h.taxType} priceSource={cfg.priceSource} showAccount={f.lineAccount} firmId={h.firmId} stockOf={(id) => stock.data?.find((s) => s.variantId === id)?.qty} />
          {f.openOrders && !!openOrders.data?.length && <div className="px-2 -mt-2 text-brand"><button className="font-medium" onClick={() => setPickOpen(true)}>📋 {new Set(openOrders.data.map((o) => o.orderId)).size} Open {f.openOrders === 'sales' ? 'Sales' : 'Purchase'} Order{openOrders.data.length > 1 ? 's' : ''}</button></div>}
          {pickOpen && <Modal open title={`Open ${f.openOrders === 'sales' ? 'Sales' : 'Purchase'} Orders`} subtitle="Pending lines — pick the ones to bring into this document" onClose={() => setPickOpen(false)} wide
            footer={<><Button variant="secondary" onClick={() => setPickOpen(false)}>Close</Button><Button onClick={() => { pullLines(openOrders.data ?? []); setPickOpen(false); }}>Add all</Button></>}>
            <table className="w-full text-sm"><thead className="text-xs text-ink-muted"><tr><th className="text-left px-2">Order</th><th className="text-left px-2">Date</th><th className="text-left px-2">Product</th><th className="text-right px-2">Pending Qty</th><th className="text-right px-2">Rate</th><th /></tr></thead>
              <tbody>{openOrders.data?.map((o) => <tr key={o.itemId} className="border-t border-line"><td className="px-2 py-1 text-brand">{o.docNo}</td><td className="px-2">{o.date}</td><td className="px-2">{o.variant?.productName} · {o.variant?.variantName}</td><td className="px-2 text-right">{o.pendingQty}</td><td className="px-2 text-right">{o.rate}</td><td className="px-2 text-right"><Button variant="ghost" className="h-7 px-2" onClick={() => pullLines([o])}>Add</Button></td></tr>)}</tbody></table></Modal>}</div>
      </Section>

      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <Section title="Additional details">
          <div className="md:col-span-3"><Field label="Internal Notes"><textarea className="field h-20 py-2" placeholder="Add notes for internal use…" value={h.internalNotes} onChange={(e) => set({ internalNotes: e.target.value })} /></Field></div>
          {f.printableNotes !== false && <div className="md:col-span-3"><Field label="Printable Notes"><textarea className="field h-20 py-2" placeholder="Add notes that will appear on the printed document…" value={h.printableNotes} onChange={(e) => set({ printableNotes: e.target.value })} /></Field></div>}
          {f.termsConditions && <div className="md:col-span-3"><Field label="Terms & Conditions"><textarea className="field h-20 py-2" value={h.termsConditions} onChange={(e) => set({ termsConditions: e.target.value })} /></Field></div>}
          {f.detailHtml && <div className="md:col-span-3"><Field label={`${cfg.title} Detail`} hint="Rich text shown on the printed document"><textarea className="field h-32 py-2" value={h.detailHtml} onChange={(e) => set({ detailHtml: e.target.value })} /></Field></div>}
        </Section>
        <SummaryPanel totals={totals} currency={currency?.symbol ?? ''} withholding={{ type: h.withholdingType, rate: h.withholdingRate }} onWithholding={(w) => set({ withholdingType: w.type, withholdingRate: w.rate })}
          adjustment={h.adjustment} onAdjustment={(n) => set({ adjustment: n })} shipping={h.shippingCharges} onShipping={f.shipping ? (n) => set({ shippingCharges: n }) : undefined} showRoundOff={f.roundOff} />
      </div>

      <div className="sticky bottom-0 bg-white border-t border-line -mx-6 px-6 py-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => nav(cfg.listPath)}>Cancel</Button>
        {cfg.statuses.map((s, i) => <Button key={s.value} variant={i === cfg.statuses.length - 1 ? 'primary' : 'secondary'} disabled={save.isPending} onClick={() => submit(s.value)}>{s.label}</Button>)}
      </div>
    </div>
  );
}

interface OpenLine { orderId: string; docNo: string; date: string; itemId: string; variantId: string; variant?: { productName: string; variantName: string; sku: string }; pendingQty: number; pendingPcs?: number; rate: number; taxRateId: string | null; discountType: string; discountValue: number }
const f0 = (cfg: PartyDocConfig) => cfg.fields?.openOrders;

function BillPicker({ contactId, value, onChange, api, label }: { contactId: string; value: string; onChange: (v: string) => void; api: string; label: string }) {
  const [unpaid, setUnpaid] = useState(false);
  const q = useQuery({ queryKey: ['outstanding', api, contactId, unpaid], queryFn: () => http.get<{ id: string; docNo: string; balance: number }[]>(`/${api}/outstanding/${contactId}`, { all: !unpaid }), enabled: !!contactId });
  return (
    <div>
      <div className="flex justify-between"><label className="label">{label}</label><Checkbox label={`Unpaid ${label.split(' ')[0]}`} checked={unpaid} onChange={(e) => setUnpaid(e.target.checked)} /></div>
      <Select value={value} disabled={!contactId} onChange={(e) => onChange(e.target.value)}><option value="">{contactId ? `Select ${label.toLowerCase()}` : 'Select party first'}</option>{q.data?.map((b) => <option key={b.id} value={b.id}>{b.docNo} (bal {b.balance})</option>)}</Select>
    </div>
  );
}
