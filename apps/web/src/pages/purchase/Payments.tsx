import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customerPaymentSchema, paymentModes, paymentTypes, customerPaymentTypes, vendorPaymentSchema } from '@erp/shared';
import { http } from '../../api/client';
import { useList, useRemove, useSave } from '../../api/hooks';
import { useAccounts, useCurrencies, type ContactOption } from '../../api/lookups';
import { useAuth } from '../../auth/AuthContext';
import { DataTable } from '../../components/DataTable';
import { Badge, Button, Field, Input, Select } from '../../components/ui';
import { Section, FormErrors, errorText } from '../../components/form/Section';
import { DocHeader, today, type DocHeaderValues } from '../../components/doc/DocHeader';
import { PartySelect } from '../../components/doc/PartySelect';
import { JournalSection } from '../../components/doc/JournalSection';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const TYPE_TONE: Record<string, 'blue' | 'orange' | 'green' | 'gray'> = { payment: 'blue', refund: 'orange', debit_note_payment: 'blue', advance: 'green' };

interface Row { id: string; docNo: string; date: string; firmName: string; branchName: string; contactName: string; paymentType: string; amount: number; status: string; createdByName: string | null }

export interface PaymentCfg { api: string; listPath: string; party: 'vendor' | 'customer'; title: string; targetApi: (isNote: boolean, contactId: string) => string; noteType: string; noteLabel: string; primaryLabel: string; paidThroughLabel: string; schema: typeof vendorPaymentSchema | typeof customerPaymentSchema; types: readonly string[] }
export const VENDOR_PAY: PaymentCfg = { api: 'purchase/payments', listPath: '/accounting/purchase/vendor-payments', party: 'vendor', title: 'Vendor Payment', targetApi: (n, c) => (n ? `/purchase/debit-notes/open/${c}` : `/purchase/bills/outstanding/${c}`), noteType: 'debit_note_payment', noteLabel: 'Debit Note', primaryLabel: 'Bill', paidThroughLabel: 'Paid Through', schema: vendorPaymentSchema, types: paymentTypes };
export const CUSTOMER_PAY: PaymentCfg = { api: 'sales/payments', listPath: '/accounting/sales/customer-payments', party: 'customer', title: 'Customer Payment', targetApi: (n, c) => (n ? `/sales/credit-notes/open/${c}` : `/sales/invoices/outstanding/${c}`), noteType: 'credit_note_payment', noteLabel: 'Credit Note', primaryLabel: 'Invoice', paidThroughLabel: 'Deposit To', schema: customerPaymentSchema, types: customerPaymentTypes };
const TARGET_TYPE = (cfg: PaymentCfg, isNote: boolean) => (cfg.party === 'vendor' ? (isNote ? 'debit_note' : 'purchase_bill') : (isNote ? 'credit_note' : 'invoice'));

export const VendorPaymentsPage = () => <PaymentsList cfg={VENDOR_PAY} />;
export const CustomerPaymentsPage = () => <PaymentsList cfg={CUSTOMER_PAY} />;
export const VendorPaymentFormPage = () => <PaymentFormPage cfg={VENDOR_PAY} />;
export const CustomerPaymentFormPage = () => <PaymentFormPage cfg={CUSTOMER_PAY} />;

function PaymentsList({ cfg }: { cfg: PaymentCfg }) {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const list = useList<Row>(cfg.api, params); const remove = useRemove(cfg.api);
  return <DataTable<Row> title={cfg.title + 's'} columns={[
    { key: 'docNo', header: 'Payment #', render: (r) => <button className="text-brand font-medium" onClick={() => nav(`${cfg.listPath}/${r.id}`)}>{r.docNo}</button> },
    { key: 'firmName', header: 'Firm' }, { key: 'branchName', header: 'Branch' }, { key: 'date', header: 'Date' }, { key: 'contactName', header: cfg.party === 'vendor' ? 'Vendor' : 'Customer' },
    { key: 'paymentType', header: 'Type', render: (r) => <Badge tone={TYPE_TONE[r.paymentType]}>{label(r.paymentType)}</Badge> },
    { key: 'amount', header: 'Amount', className: 'text-right', render: (r) => money(r.amount) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'paid' ? 'green' : 'orange'}>{label(r.status)}</Badge> }, { key: 'createdByName', header: 'Created By' },
  ]} data={list.data} loading={list.isLoading} params={params} onParams={setParams} onAdd={() => nav(`${cfg.listPath}/new`)}
    onDelete={async (r) => { if (confirm(`Delete ${r.docNo}?`)) { try { await remove.mutateAsync(r.id); } catch (e) { alert(errorText(e)); } } }} searchPlaceholder="Search by payment no…" />;
}

interface Target { id: string; docNo: string; vendorBillNo?: string; date: string; dueDate?: string | null; grandTotal: number; balance: number; currencyId: string }
interface Alloc { amount: number; writeOff: number; discountType: 'flat' | 'percent'; discountValue: number; withholdingType: 'none' | 'tds' | 'tcs'; withholdingRate: number }

function PaymentFormPage({ cfg }: { cfg: PaymentCfg }) {
  const { id } = useParams();
  if (id && id !== 'new') return <PaymentDetail cfg={cfg} id={id} />;
  return <PaymentForm cfg={cfg} />;
}

function PaymentForm({ cfg }: { cfg: PaymentCfg }) {
  const { firm } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const currencies = useCurrencies();
  const accounts = useAccounts({ firmId: firm?.id, postable: true });
  const payAccounts = (accounts.data ?? []).filter((a) => ['Cash', 'Bank', 'Other Current Liability', 'Credit Card'].includes(a.subType));
  const [h, setH] = useState<DocHeaderValues & { contactId: string; contact?: ContactOption | null; paymentType: string; paymentMode: string; paidThroughAccountId: string; currencyId: string; exchangeRate: number; amount: number; advanceApplied: number; internalNotes: string; printableNotes: string }>({
    firmId: firm?.id ?? '', branchId: '', seriesId: '', date: today(), referenceNo: '', contactId: sp.get('contactId') ?? '', paymentType: 'payment', paymentMode: '', paidThroughAccountId: '', currencyId: '', exchangeRate: 1, amount: 0, advanceApplied: 0, internalNotes: '', printableNotes: '' });
  const [allocs, setAllocs] = useState<Record<string, Alloc>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof h>) => setH((s) => ({ ...s, ...p }));
  const save = useSave<{ id: string }>(cfg.api);
  useEffect(() => { if (!h.currencyId && currencies.data) set({ currencyId: currencies.data.find((c) => c.code === 'INR')?.id ?? '' }); }, [currencies.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDn = h.paymentType === cfg.noteType;
  const showAlloc = h.paymentType === 'payment' || isDn;
  const targets = useQuery({ queryKey: ['targets', cfg.api, h.contactId, isDn], queryFn: () => http.get<Target[]>(cfg.targetApi(isDn, h.contactId)), enabled: !!h.contactId && showAlloc });
  const advances = useQuery({ queryKey: ['advances', cfg.api, h.contactId], queryFn: () => http.get<{ total: number; payments: { docNo: string; date: string; available: number }[] }>(`/${cfg.api}/advances/${h.contactId}`), enabled: !!h.contactId && h.paymentType === 'payment' });
  useEffect(() => { const cid = sp.get('contactId'); if (cid && !h.contactId) http.get<ContactOption[]>('/contacts/search', { type: 'all', term: '' }).then((cs) => { const c = cs.find((x) => x.id === cid); if (c) set({ contactId: c.id, contact: c }); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = (targets.data ?? []).filter((t) => t.currencyId === h.currencyId);
  const a = (id: string): Alloc => allocs[id] ?? { amount: 0, writeOff: 0, discountType: 'flat', discountValue: 0, withholdingType: 'none', withholdingRate: 0 };
  const setA = (id: string, p: Partial<Alloc>) => setAllocs((s) => ({ ...s, [id]: { ...a(id), ...p } }));
  const disc = (t: Target) => { const x = a(t.id); return x.discountType === 'percent' ? (t.balance * x.discountValue) / 100 : x.discountValue; };

  const sum = useMemo(() => {
    const used = rows.reduce((s, t) => s + a(t.id).amount, 0);
    const pending = rows.reduce((s, t) => s + t.balance - a(t.id).amount - disc(t) - a(t.id).writeOff, 0) - h.advanceApplied;
    return { used, pending: Math.max(0, pending), excess: Math.max(0, h.amount - used) };
  }, [rows, allocs, h.amount, h.advanceApplied]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (status: 'draft' | 'paid') => {
    setError(null);
    const body = { ...h, status, referenceNo: h.referenceNo || null, internalNotes: h.internalNotes || null, printableNotes: h.printableNotes || null,
      allocations: rows.filter((t) => a(t.id).amount > 0 || disc(t) > 0 || a(t.id).writeOff > 0 || a(t.id).withholdingType !== 'none' || h.advanceApplied > 0).map((t) => ({ targetType: TARGET_TYPE(cfg, isDn), targetId: t.id, ...a(t.id) })) };
    const parsed = cfg.schema.safeParse(body);
    if (!parsed.success) { setError(parsed.error.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`).join(' · ')); return; }
    try { const d = await save.mutateAsync({ data: parsed.data }); nav(`${cfg.listPath}/${d.id}`); } catch (e) { setError(errorText(e)); }
  };
  const sym = currencies.data?.find((c) => c.id === h.currencyId)?.symbol ?? '';

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">{cfg.title}</h1>
      <FormErrors error={error} />
      <Section title="Payment details">
        <DocHeader docType="vendor_payment" numberLabel="Payment#" values={h} onChange={set} />
        <Field label={cfg.party === 'vendor' ? 'Vendor' : 'Customer'} required><PartySelect type={cfg.party} value={h.contact} onChange={(c) => { set({ contactId: c.id, contact: c }); setAllocs({}); }} /></Field>
        <Field label="Payment Mode" required><Select value={h.paymentMode} onChange={(e) => set({ paymentMode: e.target.value })}><option value="">Select payment mode</option>{paymentModes.map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select></Field>
        <Field label="Payment Type" required><Select value={h.paymentType} onChange={(e) => { set({ paymentType: e.target.value, advanceApplied: 0 }); setAllocs({}); }}>{cfg.types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Currency & Exchange Rate" required><div className="flex gap-1"><Select className="flex-1" value={h.currencyId} onChange={(e) => set({ currencyId: e.target.value })}>{currencies.data?.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}</Select><Input type="number" step="any" className="w-24" value={h.exchangeRate} onChange={(e) => set({ exchangeRate: Number(e.target.value) })} /></div></Field>
        <div><div className="flex justify-between"><label className="label req">Amount</label>{showAlloc && rows.length > 0 && <span className="text-xs text-brand">Total Pending: {sym}{money(rows.reduce((s, t) => s + t.balance, 0))}</span>}</div><Input type="number" step="any" value={h.amount || ''} onChange={(e) => set({ amount: Number(e.target.value) })} /></div>
        <Field label={cfg.paidThroughLabel} required><Select value={h.paidThroughAccountId} onChange={(e) => set({ paidThroughAccountId: e.target.value })}><option value="">Select account</option>{payAccounts.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.subType}) ({sym}{money(x.balance)})</option>)}</Select></Field>
      </Section>

      {showAlloc && h.contactId && (
        <Section title={`${cfg.primaryLabel} allocation`}>
          <div className="md:col-span-3 overflow-x-auto">
            {rows.length === 0 ? <p className="py-8 text-center text-ink-muted">No outstanding {isDn ? cfg.noteLabel.toLowerCase() + 's' : cfg.primaryLabel.toLowerCase() + 's'} found in this currency</p> : (
              <table className="w-full"><thead className="text-xs uppercase text-ink-muted"><tr><th className="text-left px-2 py-2">Bill Date</th><th className="text-left px-2">Module No</th><th className="text-left px-2">Type</th><th className="text-right px-2">Total</th><th className="text-left px-2">Write-off</th><th className="text-left px-2">Discount</th>{!isDn && <th className="text-left px-2">TDS</th>}<th className="text-right px-2">Amount Due</th><th className="text-left px-2">Payment</th></tr></thead>
                <tbody>{rows.map((t) => { const x = a(t.id); const due = Math.max(0, t.balance - disc(t) - x.writeOff); return (
                  <tr key={t.id} className="border-t border-line"><td className="px-2 py-2">{t.date}</td><td className="px-2">{t.docNo}{t.vendorBillNo && <span className="text-ink-muted text-xs"> / {t.vendorBillNo}</span>}</td><td className="px-2"><Badge tone="blue">{isDn ? cfg.noteLabel : cfg.primaryLabel}</Badge></td>
                    <td className="px-2 text-right">{money(t.balance)}</td>
                    <td className="px-2"><Input type="number" step="any" className="w-24 h-9 text-right" value={x.writeOff || ''} onChange={(e) => setA(t.id, { writeOff: Number(e.target.value) })} /></td>
                    <td className="px-2"><div className="flex"><Select className="w-14 h-9 rounded-r-none px-1" value={x.discountType} onChange={(e) => setA(t.id, { discountType: e.target.value as 'flat' })}><option value="flat">F</option><option value="percent">%</option></Select><Input type="number" step="any" className="w-20 h-9 rounded-l-none text-right" value={x.discountValue || ''} onChange={(e) => setA(t.id, { discountValue: Number(e.target.value) })} /></div></td>
                    {!isDn && <td className="px-2"><Select className="w-24 h-9" value={x.withholdingType === 'tds' ? x.withholdingRate : 0} onChange={(e) => setA(t.id, { withholdingType: Number(e.target.value) ? 'tds' : 'none', withholdingRate: Number(e.target.value) })}><option value={0}>None</option>{[0.1, 1, 2, 5, 10].map((r) => <option key={r} value={r}>{r}%</option>)}</Select></td>}
                    <td className="px-2 text-right font-medium">{money(due)}</td>
                    <td className="px-2"><Input type="number" step="any" className="w-28 h-9 text-right" value={x.amount || ''} onChange={(e) => setA(t.id, { amount: Number(e.target.value) })} onBlur={() => { if (x.amount > due) setA(t.id, { amount: due }); }} /></td></tr>); })}</tbody></table>
            )}
          </div>
          {!isDn && <div className="md:col-span-1 rounded-md border border-line p-4">
            <div className="font-semibold mb-1">Apply Advance Payment</div><div className="text-sm">Available Advance: <span className="text-green-700 font-medium">{sym}{money(advances.data?.total ?? 0)}</span></div>
            <div className="flex items-center gap-2 mt-2"><span className="text-sm">Amount to Apply</span><Input type="number" step="any" className="w-32 h-9" disabled={!advances.data?.total} value={h.advanceApplied || ''} onChange={(e) => set({ advanceApplied: Math.min(Number(e.target.value), advances.data?.total ?? 0) })} /></div>
            {!!advances.data?.payments.length && <div className="mt-3 text-xs"><div className="uppercase text-ink-muted mb-1">Available advance payments</div>{advances.data.payments.map((p) => <div key={p.docNo} className="flex justify-between bg-canvas rounded px-2 py-1"><span>{p.docNo} <span className="text-ink-muted">{p.date}</span></span><span>{sym}{money(p.available)}</span></div>)}</div>}
          </div>}
          <div className="md:col-span-2 rounded-md border border-line p-4 grid gap-1 text-sm">
            <div className="font-semibold mb-1">Payment Summary</div>
            <div className="flex justify-between"><span>Amount Paid</span><span>{sym}{money(h.amount)}</span></div>
            <div className="flex justify-between"><span>Advance Amount Apply</span><span className="text-green-700">{sym}{money(h.advanceApplied)}</span></div>
            <div className="flex justify-between"><span>Amount used for Payments</span><span className="text-brand">{sym}{money(sum.used)}</span></div>
            <div className="flex justify-between"><span>Pending Amount</span><span className="text-red-600">{sym}{money(sum.pending)}</span></div>
            <div className="flex justify-between"><span>Amount in Excess</span><span>{sym}{money(sum.excess)}</span></div>
          </div>
        </Section>
      )}

      <Section title="Notes">
        <div className="md:col-span-2"><Field label="Internal Notes"><textarea className="field h-20 py-2" value={h.internalNotes} onChange={(e) => set({ internalNotes: e.target.value })} /></Field></div>
        <div><Field label="Printable Notes"><textarea className="field h-20 py-2" value={h.printableNotes} onChange={(e) => set({ printableNotes: e.target.value })} /></Field></div>
      </Section>
      <div className="sticky bottom-0 bg-white border-t border-line -mx-6 px-6 py-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => nav(cfg.listPath)}>Cancel</Button><Button variant="secondary" onClick={() => submit('draft')}>Save as Draft</Button><Button onClick={() => submit('paid')} disabled={save.isPending}>Save as Paid</Button>
      </div>
    </div>
  );
}

function PaymentDetail({ cfg, id }: { cfg: PaymentCfg; id: string }) {
  const nav = useNavigate(); const qc = useQueryClient();
  const q = useQuery({ queryKey: [cfg.api, id], queryFn: () => http.get<Row & { paidThroughName: string; paymentMode: string; referenceNo: string | null; internalNotes: string | null; allocatedAmount: number; advanceApplied: number; unallocated: number; allocations: { id: string; targetType: string; docNo: string; refNo?: string; date: string; total: number; applied: number; amount: number; advanceAmount: number; discount: number; writeOff: number; withholding: number }[] }>(`/${cfg.api}/${id}`) });
  const d = q.data; if (!d) return <p className="text-ink-muted">Loading…</p>;
  const remove = async () => { if (!confirm(`Delete ${d.docNo}?`)) return; try { await http.del(`/${cfg.api}/${id}`); await qc.invalidateQueries({ queryKey: [cfg.api] }); nav(cfg.listPath); } catch (e) { alert(errorText(e)); } };
  return (
    <div className="grid gap-4 max-w-5xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{d.docNo} <Badge tone={d.status === 'paid' ? 'green' : 'orange'}>{d.status.toUpperCase()}</Badge></h1><div className="flex gap-2"><Button variant="secondary" onClick={() => nav(cfg.listPath)}>Back</Button><Button variant="danger" onClick={remove}>Delete</Button></div></div>
      <section className="card p-6 flex items-center gap-5"><div className="h-14 w-14 rounded-lg bg-canvas grid place-items-center text-2xl text-ink-muted">₹</div><div><div className="text-2xl font-bold">{money(d.amount)}</div><div className="font-medium">{d.contactName}</div><div className="text-ink-muted text-sm">Payment Date: {d.date} · {d.paidThroughName}</div></div></section>
      <Section title="Payment details">
        <div><div className="label">Payment Type</div><Badge tone={TYPE_TONE[d.paymentType]}>{label(d.paymentType)}</Badge></div><div><div className="label">Payment Mode</div>{label(d.paymentMode)}</div><div><div className="label">Ref No.</div>{d.referenceNo ?? '-'}</div>
      </Section>
      {d.allocations.length > 0 && <section className="card"><div className="px-5 py-3 border-b border-line text-[13px] font-semibold tracking-wide text-ink-muted">Bill allocations</div>
        <table className="w-full text-sm"><thead className="text-xs text-ink-muted"><tr><th className="text-left px-5 py-2">Type</th><th className="text-left px-5">Doc #</th><th className="text-left px-5">Ref</th><th className="text-left px-5">Date</th><th className="text-right px-5">Amount</th><th className="text-right px-5">Cash</th><th className="text-right px-5">Advance</th><th className="text-right px-5">Disc / W-off / TDS</th><th className="text-right px-5">Applied</th></tr></thead>
          <tbody>{d.allocations.map((x) => <tr key={x.id} className="border-t border-line"><td className="px-5 py-2">{label(x.targetType)}</td><td className="px-5 text-brand">{x.docNo}</td><td className="px-5">{x.refNo ?? ''}</td><td className="px-5">{x.date}</td><td className="px-5 text-right">{money(x.total)}</td><td className="px-5 text-right">{money(x.amount)}</td><td className="px-5 text-right">{money(x.advanceAmount)}</td><td className="px-5 text-right">{money(x.discount + x.writeOff + x.withholding)}</td><td className="px-5 text-right font-medium">{money(x.applied)}</td></tr>)}</tbody></table></section>}
      <div className="rounded-lg bg-brand text-white p-5 grid grid-cols-[1fr_auto] gap-4"><div className="grid gap-2 text-sm"><div className="flex justify-between border-b border-white/20 pb-2"><span>Allocated Amount</span><span>{money(d.allocatedAmount)}</span></div><div className="flex justify-between"><span>Unallocated / Advance</span><span>{money(d.unallocated)}</span></div></div><div className="text-right"><div className="text-xs uppercase opacity-80">Net Paid Amount</div><div className="text-3xl font-bold">{money(d.amount)}</div></div></div>
      <JournalSection sourceType={cfg.party === 'vendor' ? 'vendor_payment' : 'customer_payment'} sourceId={id} />
    </div>
  );
}
