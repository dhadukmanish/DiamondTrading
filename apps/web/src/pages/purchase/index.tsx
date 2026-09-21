import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { debitNoteSchema, purchaseBillSchema, purchaseOrderReturnSchema, purchaseOrderSchema } from '@erp/shared';
import { useList, useRemove } from '../../api/hooks';
import { DataTable } from '../../components/DataTable';
import { Badge } from '../../components/ui';
import { errorText } from '../../components/form/Section';
import { PartyDocForm, type PartyDocConfig } from './PartyDocForm';
import { PartyDocDetail } from './PartyDocDetail';

const money = (n: number | string) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const TONE: Record<string, 'gray' | 'blue' | 'green' | 'orange' | 'red'> = { draft: 'orange', open: 'blue', partial: 'orange', paid: 'green', billed: 'green', confirmed: 'blue', closed: 'green' };

export const PO_CFG: PartyDocConfig = { docType: 'purchase_order', title: 'Purchase Order', numberLabel: 'Order#', api: 'purchase/orders', listPath: '/accounting/purchase/orders', party: 'vendor', schema: purchaseOrderSchema, priceSource: 'purchase',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'open', label: 'Save as Open' }], fields: { vendorBillNo: 'optional', expectedDate: true } };
export const POR_CFG: PartyDocConfig = { docType: 'purchase_order_return', title: 'Purchase Order Return', numberLabel: 'Return#', api: 'purchase/order-returns', listPath: '/accounting/purchase/order-returns', party: 'vendor', schema: purchaseOrderReturnSchema, priceSource: 'purchase',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'confirmed', label: 'Save as Confirmed' }], fields: { printableNotes: false } };
export const BILL_CFG: PartyDocConfig = { docType: 'purchase_bill', title: 'Purchase Bill', numberLabel: 'Bill#', api: 'purchase/bills', listPath: '/accounting/purchase/bills', party: 'vendor', schema: purchaseBillSchema, priceSource: 'purchase',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'open', label: 'Save as Open' }], fields: { vendorBillNo: 'required', salesPerson: true, paymentTerms: true, shipping: true, openOrders: 'purchase' }, actions: { recordPayment: '/accounting/purchase/vendor-payments/new', note: '/accounting/purchase/debit-notes/new' } };
export const DN_CFG: PartyDocConfig = { docType: 'debit_note', title: 'Debit Note', numberLabel: 'Debit Note#', api: 'purchase/debit-notes', listPath: '/accounting/purchase/debit-notes', party: 'vendor', schema: debitNoteSchema, priceSource: 'purchase',
  statuses: [{ value: 'draft', label: 'Save as Draft' }, { value: 'open', label: 'Save as Open' }], fields: { billLink: true, reason: true, amountOnly: true, lineAccount: true } };

interface Row { id: string; docNo: string; date: string; firmName: string; branchName: string; contactName: string; grandTotal: string; status: string; createdAt: string; createdByName: string | null; vendorBillNo?: string; paidAmount?: string; balance?: number; overdue?: boolean; dueDate?: string; reason?: string | null }

function List({ cfg, extra }: { cfg: PartyDocConfig; extra?: (r: Row) => Record<string, React.ReactNode> }) {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const list = useList<Row>(cfg.api, params); const remove = useRemove(cfg.api);
  const ex = extra ?? (() => ({}));
  return <DataTable<Row> title={cfg.title + 's'} columns={[
    { key: 'docNo', header: cfg.numberLabel.replace('#', ' #'), render: (r) => <button className="text-brand font-medium" onClick={() => nav(`${cfg.listPath}/${r.id}`)}>{r.docNo}</button> },
    ...Object.entries(ex(list.data?.rows[0] ?? ({} as Row))).map(([k]) => ({ key: k, header: k, render: (r: Row) => (ex(r) as Record<string, React.ReactNode>)[k] })),
    { key: 'firmName', header: 'Firm' }, { key: 'branchName', header: 'Branch' }, { key: 'date', header: 'Date' }, { key: 'contactName', header: 'Vendor' },
    { key: 'grandTotal', header: 'Amount', className: 'text-right', render: (r) => money(r.grandTotal) },
    ...(cfg.docType === 'purchase_bill' ? [{ key: 'paid', header: 'Paid', className: 'text-right', render: (r: Row) => <span className="text-green-700">{money(r.paidAmount ?? 0)}</span> }, { key: 'balance', header: 'Balance', className: 'text-right', render: (r: Row) => <span className={(r.balance ?? 0) > 0 ? 'text-red-600' : ''}>{money(r.balance ?? 0)}</span> }] : []),
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.overdue ? 'red' : TONE[r.status] ?? 'gray'}>{r.overdue ? 'Overdue' : r.status}</Badge> },
    { key: 'createdByName', header: 'Created By' },
  ]} data={list.data} loading={list.isLoading} params={params} onParams={setParams} onAdd={() => nav(`${cfg.listPath}/new`)}
    onDelete={async (r) => { if (confirm(`Delete ${r.docNo}?`)) { try { await remove.mutateAsync(r.id); } catch (e) { alert(errorText(e)); } } }} searchPlaceholder={`Search by ${cfg.numberLabel.replace('#', '').toLowerCase()} no, reference…`} />;
}

export const PurchaseOrdersPage = () => <List cfg={PO_CFG} />;
export const PurchaseOrderReturnsPage = () => <List cfg={POR_CFG} />;
export const PurchaseBillsPage = () => <List cfg={BILL_CFG} extra={(r) => ({ 'Order Number': r.vendorBillNo ?? '' })} />;
export const DebitNotesPage = () => <List cfg={DN_CFG} extra={(r) => ({ Reason: r.reason ?? '-' })} />;
export const PurchaseOrderForm = () => <PartyDocForm cfg={PO_CFG} />;
export const PurchaseOrderReturnForm = () => <PartyDocForm cfg={POR_CFG} />;
export const PurchaseBillForm = () => <PartyDocForm cfg={BILL_CFG} />;
export const DebitNoteForm = () => <PartyDocForm cfg={DN_CFG} />;
export const PurchaseOrderDetail = () => <PartyDocDetail cfg={PO_CFG} />;
export const PurchaseOrderReturnDetail = () => <PartyDocDetail cfg={POR_CFG} />;
export const PurchaseBillDetail = () => <PartyDocDetail cfg={BILL_CFG} />;
export const DebitNoteDetail = () => <PartyDocDetail cfg={DN_CFG} />;
