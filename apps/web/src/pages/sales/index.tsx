import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { creditNoteSchema, estimateSchema, followupChannels, followupOutcomes, invoiceSchema, salesOrderSchema } from '@erp/shared';
import { http } from '../../api/client';
import { useList, useRemove } from '../../api/hooks';
import { DataTable } from '../../components/DataTable';
import { Badge, Button, Field, Input, Modal } from '../../components/ui';
import { errorText } from '../../components/form/Section';
import { PartyDocForm, type PartyDocConfig } from '../purchase/PartyDocForm';
import { PartyDocDetail, type PartyDoc } from '../purchase/PartyDocDetail';
import { ReturnStockModal } from './ReturnStock';

const money = (n: number | string) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const TONE: Record<string, 'gray' | 'blue' | 'green' | 'orange' | 'red'> = { draft: 'orange', sent: 'blue', accepted: 'blue', open: 'blue', partial: 'orange', paid: 'green', closed: 'green', cancelled: 'red', confirmed: 'blue' };
const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const EST_CFG: PartyDocConfig = { docType: 'estimate', title: 'Estimate', numberLabel: 'Estimate#', api: 'sales/estimates', listPath: '/accounting/sales/estimates', party: 'customer', schema: estimateSchema, priceSource: 'selling',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'sent', label: 'Save' }], fields: { validUntil: true, salesPerson: true, paymentTerms: true, roundOff: true, detailHtml: true } };
export const SO_CFG: PartyDocConfig = { docType: 'sales_order', title: 'Sales Order', numberLabel: 'Sales Order#', api: 'sales/orders', listPath: '/accounting/sales/orders', party: 'customer', schema: salesOrderSchema, priceSource: 'selling',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'open', label: 'Save as Open' }], fields: { expectedDate: true, paymentTerms: true, roundOff: true } };
export const INV_CFG: PartyDocConfig = { docType: 'invoice', title: 'Invoice', numberLabel: 'Invoice#', api: 'sales/invoices', listPath: '/accounting/sales/invoices', party: 'customer', schema: invoiceSchema, priceSource: 'selling',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'open', label: 'Save as Open' }], fields: { consignee: true, salesPerson: true, paymentTerms: true, roundOff: true, termsConditions: true, openOrders: 'sales' }, actions: { recordPayment: '/accounting/sales/customer-payments/new', note: '/accounting/sales/credit-notes/new' } };
export const CN_CFG: PartyDocConfig = { docType: 'credit_note', title: 'Credit Note', numberLabel: 'Credit Note#', api: 'sales/credit-notes', listPath: '/accounting/sales/credit-notes', party: 'customer', schema: creditNoteSchema, priceSource: 'selling',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'open', label: 'Save as Open' }], fields: { invoiceLink: true, reason: true, amountOnly: true, lineAccount: true, roundOff: true } };

interface Row { id: string; docNo: string; date: string; firmName: string; branchName: string; contactName: string; grandTotal: string; status: string; createdByName: string | null; validUntil?: string | null; paidAmount?: string; balance?: number; overdue?: boolean; dueDate?: string; reason?: string | null; salesOrderId?: string; totalValue?: string }

function List({ cfg, extra, invoice }: { cfg: PartyDocConfig; extra?: (r: Row) => Record<string, React.ReactNode>; invoice?: boolean }) {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const list = useList<Row>(cfg.api, params); const remove = useRemove(cfg.api);
  const ex = extra ?? (() => ({}));
  return <DataTable<Row> title={cfg.title + 's'} columns={[
    { key: 'docNo', header: cfg.numberLabel.replace('#', ' #'), render: (r) => <button className="text-brand font-medium" onClick={() => nav(`${cfg.listPath}/${r.id}`)}>{r.docNo}</button> },
    { key: 'firmName', header: 'Firm' }, { key: 'branchName', header: 'Branch' }, { key: 'date', header: 'Date' }, { key: 'contactName', header: 'Customer' },
    { key: 'grandTotal', header: 'Amount', className: 'text-right', render: (r) => money(r.grandTotal) },
    ...Object.keys(ex(list.data?.rows[0] ?? ({} as Row))).map((k) => ({ key: k, header: k, render: (r: Row) => (ex(r) as Record<string, React.ReactNode>)[k] })),
    ...(invoice ? [{ key: 'balance', header: 'Balance', className: 'text-right', render: (r: Row) => <span className={(r.balance ?? 0) > 0 ? 'text-red-600' : ''}>{money(r.balance ?? 0)}</span> }] : []),
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.overdue ? 'red' : TONE[r.status] ?? 'gray'}>{r.overdue ? 'Overdue' : label(r.status === 'partial' ? 'Partially' : r.status)}</Badge> },
    { key: 'createdByName', header: 'Created By' },
  ]} data={list.data} loading={list.isLoading} params={params} onParams={setParams} onAdd={() => nav(`${cfg.listPath}/new`)}
    onDelete={async (r) => { if (confirm(`Delete ${r.docNo}?`)) { try { await remove.mutateAsync(r.id); } catch (e) { alert(errorText(e)); } } }} searchPlaceholder={`Search by ${cfg.title.toLowerCase()} no, customer…`} />;
}

export const EstimatesPage = () => <List cfg={EST_CFG} extra={(r) => ({ 'Valid Until': r.validUntil ?? '-' })} />;
export const SalesOrdersPage = () => <List cfg={SO_CFG} />;
export const InvoicesPage = () => <List cfg={INV_CFG} invoice extra={(r) => ({ 'Due Date': r.dueDate ?? '-' })} />;
export const CreditNotesPage = () => <List cfg={CN_CFG} extra={(r) => ({ Reason: r.reason ?? '-' })} />;
export const EstimateForm = () => <PartyDocForm cfg={EST_CFG} />;
export const SalesOrderForm = () => <PartyDocForm cfg={SO_CFG} />;
export const InvoiceForm = () => <PartyDocForm cfg={INV_CFG} />;
export const CreditNoteForm = () => <PartyDocForm cfg={CN_CFG} />;
export const EstimateDetail = () => <PartyDocDetail cfg={EST_CFG} />;
export const CreditNoteDetail = () => <PartyDocDetail cfg={CN_CFG} />;

/** SO detail adds: Return Stock, Cancel Order, Convert to Invoice, and the returns list. */
export function SalesOrderDetail() {
  const nav = useNavigate(); const qc = useQueryClient();
  const [ret, setRet] = useState<PartyDoc | null>(null);
  const cancel = async (d: PartyDoc) => { if (!confirm(`Cancel ${d.docNo}? Committed stock is released.`)) return; await http.post(`/sales/orders/${d.id}/cancel`, {}); await qc.invalidateQueries({ queryKey: ['sales/orders'] }); };
  return (
    <>
      <PartyDocDetail cfg={SO_CFG}
        actions={(d) => ['open', 'partial'].includes(d.status) && <><Button onClick={() => nav(`/accounting/sales/invoices/new?contactId=${(d as unknown as { contactId: string }).contactId}&fromOrder=${d.id}`)}>⟳ Convert to Invoice</Button><Button variant="secondary" onClick={() => setRet(d)}>↩ Return Stock</Button><Button variant="secondary" onClick={() => cancel(d)}>Cancel Order</Button></>}
        extra={(d) => <ReturnsList orderId={d.id} />} />
      {ret && <ReturnStockModal order={ret} onClose={() => setRet(null)} />}
    </>
  );
}

function ReturnsList({ orderId }: { orderId: string }) {
  const q = useQuery({ queryKey: ['so-returns', orderId], queryFn: () => http.get<{ id: string; docNo: string; date: string; totalValue: string; items: { returnQty: number; lossQty: number; lossValue: number }[] }[]>(`/sales/orders/${orderId}/returns`) });
  if (!q.data?.length) return null;
  return <section className="card"><div className="px-5 py-3 border-b border-line text-[13px] font-semibold tracking-wide text-ink-muted">Returns</div>
    <table className="w-full text-sm"><thead className="text-xs text-ink-muted"><tr><th className="text-left px-5 py-2">Return #</th><th className="text-left px-5">Date</th><th className="text-right px-5">Returned Qty</th><th className="text-right px-5">Loss Qty</th><th className="text-right px-5">Loss Value</th></tr></thead>
      <tbody>{q.data.map((r) => <tr key={r.id} className="border-t border-line"><td className="px-5 py-2 text-brand">{r.docNo}</td><td className="px-5">{r.date}</td><td className="px-5 text-right">{r.items.reduce((s, i) => s + i.returnQty, 0)}</td><td className="px-5 text-right">{r.items.reduce((s, i) => s + i.lossQty, 0)}</td><td className="px-5 text-right">{money(r.totalValue)}</td></tr>)}</tbody></table></section>;
}

/** Invoice detail adds the Follow-ups section. */
export function InvoiceDetail() {
  return <PartyDocDetail cfg={INV_CFG} extra={(d) => <Followups invoiceId={d.id} docNo={d.docNo} customer={d.contactName} />} />;
}

function Followups({ invoiceId, docNo, customer }: { invoiceId: string; docNo: string; customer: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['followups', invoiceId], queryFn: () => http.get<{ id: string; outcome: string; channel: string; comment: string | null; nextFollowupAt: string | null; createdAt: string; createdByName: string | null }[]>(`/sales/invoices/${invoiceId}/followups`) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ outcome: 'promised_to_pay', channel: 'call', comment: '', nextFollowupAt: '' });
  const save = async () => { await http.post(`/sales/invoices/${invoiceId}/followups`, { ...f, comment: f.comment || null, nextFollowupAt: f.nextFollowupAt ? new Date(f.nextFollowupAt).toISOString() : null }); await qc.invalidateQueries({ queryKey: ['followups', invoiceId] }); setOpen(false); };
  const Chip = ({ v, cur, on }: { v: string; cur: string; on: () => void }) => <button onClick={on} className={`px-3 py-1.5 rounded-full border text-sm ${cur === v ? 'border-brand text-brand bg-brand-soft' : 'border-line text-ink'}`}>{label(v)}</button>;
  return (
    <section className="card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line"><div className="text-[13px] font-semibold tracking-wide text-ink-muted">Follow-ups <Badge tone="blue">{q.data?.length ?? 0}</Badge></div><Button variant="ghost" className="h-8" onClick={() => setOpen(true)}>📅 Add Follow-up</Button></div>
      {!q.data?.length ? <p className="px-5 py-4 text-ink-muted">No follow-ups yet.</p> : (
        <ul className="divide-y divide-line">{q.data.map((x) => <li key={x.id} className="px-5 py-3 text-sm"><div className="flex justify-between"><span><Badge tone={x.outcome === 'disputed' ? 'red' : x.outcome === 'no_response' ? 'orange' : 'green'}>{label(x.outcome)}</Badge> <span className="text-ink-muted">via {label(x.channel)}</span></span><span className="text-ink-muted text-xs">{new Date(x.createdAt).toLocaleString()} · {x.createdByName}</span></div>{x.comment && <p className="mt-1">{x.comment}</p>}{x.nextFollowupAt && <p className="text-xs text-brand mt-1">Next: {new Date(x.nextFollowupAt).toLocaleString()}</p>}</li>)}</ul>)}
      <Modal open={open} title="Add Follow-up" subtitle={`${docNo} · ${customer}`} onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save Follow-up</Button></>}>
        <div><div className="label">Outcome</div><div className="flex flex-wrap gap-2">{followupOutcomes.map((o) => <Chip key={o} v={o} cur={f.outcome} on={() => setF({ ...f, outcome: o })} />)}</div></div>
        <div><div className="label">Channel</div><div className="flex flex-wrap gap-2">{followupChannels.map((c) => <Chip key={c} v={c} cur={f.channel} on={() => setF({ ...f, channel: c })} />)}</div></div>
        <Field label="Comment"><textarea className="field h-24 py-2" placeholder="What was discussed?" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field>
        <Field label="Next follow-up"><Input type="datetime-local" value={f.nextFollowupAt} onChange={(e) => setF({ ...f, nextFollowupAt: e.target.value })} /></Field>
      </Modal>
    </section>
  );
}
