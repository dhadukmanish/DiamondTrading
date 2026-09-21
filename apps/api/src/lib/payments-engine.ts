import { and, asc, eq, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, type Tx } from '../db/client';
import { accounts } from '../db/schema';
import { docHeader } from './documents';
import { badRequest, conflict, notFound } from './errors';
import { postJournal, unpostJournal, type JournalLineInput } from './ledger';
import { decorate } from './party-doc';
import type { Ctx } from './context';

const r4 = (n: number) => Math.round(n * 10000) / 10000;
export const settleStatus = (grand: number, paid: number) => (paid <= 0 ? 'open' : paid + 0.005 >= grand ? 'paid' : 'partial');

type AnyTable = PgTable & Record<string, PgColumn>;
export interface PaymentConfig {
  side: 'payable' | 'receivable';
  sourceType: string;
  payments: AnyTable; allocations: AnyTable; advanceApps: AnyTable;
  /** targets: primary = bills/invoices, note = debit/credit notes */
  primary: { table: AnyTable; paidCol: string; type: string; noteClosed?: never };
  note: { table: AnyTable; paidCol: string; type: string };
  /** types that bring money in vs out */
  inflowTypes: string[];
  noteType: string;                      // 'debit_note_payment' | 'credit_note_payment'
  partyKey: string;                      // accounts_payable | accounts_receivable
  discountKey: string; writeOffKey: string; withholdingKey: string;
}
interface PaymentInput {
  firmId: string; branchId: string; seriesId: string; number?: number; date: string; referenceNo?: string | null; notes?: string | null;
  contactId: string; paymentType: string; paymentMode: string; paidThroughAccountId: string; currencyId: string; exchangeRate: number; amount: number;
  internalNotes?: string | null; printableNotes?: string | null; advanceApplied: number; status: string;
  allocations: { targetType: string; targetId: string; amount: number; writeOff: number; discountType: 'flat' | 'percent'; discountValue: number; withholdingType: 'none' | 'tds' | 'tcs'; withholdingRate: number }[];
}

/** Unallocated cash of a party's earlier payments/advances (FIFO by date). */
export async function availableAdvances(cfg: PaymentConfig, tx: Tx, tenantId: string, contactId: string) {
  const p = cfg.payments;
  const rows = await tx.select().from(p).where(and(eq(p.tenantId!, tenantId), eq(p.contactId!, contactId), eq(p.status!, 'paid'), sql`${p.paymentType} in ('payment','advance')`)).orderBy(asc(p.date!), asc(p.createdAt!)) as Record<string, unknown>[];
  return rows.map((x) => ({ paymentId: x.id as string, docNo: x.docNo as string, date: x.date as string, available: r4(Number(x.amount) - Number(x.allocatedAmount) - Number(x.advanceUsed)) })).filter((a) => a.available > 0.005);
}

/**
 * Shared settle logic for vendor and customer payments.
 * payable:    payment/advance → Party Dr | Bank Cr (+ discount received, write-off, TDS payable Cr); refund/note-payment → Bank Dr | Party Cr
 * receivable: payment/advance → Bank Dr | Party Cr (+ discount allowed, bad debts, TDS receivable Dr); refund/note-payment → Party Dr | Bank Cr
 */
export async function createPayment(cfg: PaymentConfig, ctx: Ctx, input: PaymentInput) {
  return db.transaction(async (tx) => {
    const [acc] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.tenantId, ctx.tenantId), eq(accounts.id, input.paidThroughAccountId)));
    if (!acc) throw badRequest('Bank/cash account not found');
    const isNote = input.paymentType === cfg.noteType;
    const target = isNote ? cfg.note : cfg.primary;
    const allocs = input.paymentType === 'refund' || input.paymentType === 'advance' ? [] : input.allocations.filter((a) => a.targetType === target.type);

    let cash = 0, discount = 0, writeOff = 0, wh = 0, advanceLeft = input.advanceApplied;
    const advances = advanceLeft > 0 ? await availableAdvances(cfg, tx, ctx.tenantId, input.contactId) : [];
    if (advanceLeft > r4(advances.reduce((s, a) => s + a.available, 0)) + 0.005) throw badRequest('Advance to apply exceeds the available advance');
    const allocRows: Record<string, unknown>[] = [];
    for (const a of allocs) {
      const T = target.table;
      const [t] = await tx.select().from(T).where(and(eq(T.tenantId!, ctx.tenantId), eq(T.id!, a.targetId))) as Record<string, unknown>[];
      if (!t) throw notFound('Allocation target');
      const grand = Number(t.grandTotal), paid = Number(t[target.paidCol]);
      const balance = r4(grand - paid);
      const disc = r4(a.discountType === 'percent' ? (balance * a.discountValue) / 100 : a.discountValue);
      const w = a.withholdingType !== 'none' ? r4((Number(t.taxableTotal) * a.withholdingRate) / 100) : 0;
      const adv = Math.min(advanceLeft, Math.max(0, balance - a.amount - disc - a.writeOff - w)); advanceLeft = r4(advanceLeft - adv);
      const settled = r4(a.amount + adv + disc + a.writeOff + w);
      if (settled > balance + 0.005) throw badRequest(`Allocation exceeds balance of ${balance}`);
      if (settled <= 0) continue;
      allocRows.push({ targetType: target.type, targetId: a.targetId, amount: String(a.amount), advanceAmount: String(adv), writeOff: String(a.writeOff), discount: String(disc), withholding: String(w) });
      cash += a.amount; discount += disc; writeOff += a.writeOff; wh += w;
      const newPaid = r4(paid + settled);
      await tx.update(T).set({ [target.paidCol]: String(newPaid), status: isNote ? (newPaid + 0.005 >= grand ? 'closed' : 'open') : settleStatus(grand, newPaid) } as never).where(eq(T.id!, a.targetId));
    }
    if (cash > input.amount + 0.005) throw badRequest('Allocated cash exceeds the payment amount');
    const advanceApplied = r4(input.advanceApplied - advanceLeft);

    const [doc] = await tx.insert(cfg.payments).values({ ...(await docHeader(tx, ctx, input)), contactId: input.contactId, paymentType: input.paymentType, paymentMode: input.paymentMode, paidThroughAccountId: input.paidThroughAccountId,
      currencyId: input.currencyId, exchangeRate: String(input.exchangeRate), amount: String(input.amount), allocatedAmount: String(r4(cash)), advanceApplied: String(advanceApplied),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, status: input.status } as never).returning() as Record<string, unknown>[];
    const docId = doc!.id as string, docNo = doc!.docNo as string;
    if (allocRows.length) await tx.insert(cfg.allocations).values(allocRows.map((a) => ({ ...a, paymentId: docId })) as never);

    let toConsume = advanceApplied;
    for (const adv of advances) {
      if (toConsume <= 0) break;
      const take = Math.min(adv.available, toConsume); toConsume = r4(toConsume - take);
      await tx.insert(cfg.advanceApps).values({ paymentId: docId, sourcePaymentId: adv.paymentId, amount: String(take) } as never);
      await tx.update(cfg.payments).set({ advanceUsed: sql`${cfg.payments.advanceUsed} + ${take}` } as never).where(eq(cfg.payments.id!, adv.paymentId));
    }

    if (input.status === 'paid') {
      const inflow = cfg.inflowTypes.includes(input.paymentType);
      const party = { systemKey: cfg.partyKey, contactId: input.contactId };
      const extra = r4(discount + writeOff + wh);
      const lines: JournalLineInput[] = inflow
        ? [{ accountId: acc.id, debit: input.amount }, { ...party, credit: r4(input.amount + extra) }, { systemKey: cfg.discountKey, debit: discount }, { systemKey: cfg.writeOffKey, debit: writeOff }, { systemKey: cfg.withholdingKey, debit: wh }]
        : [{ ...party, debit: r4(input.amount + extra) }, { accountId: acc.id, credit: input.amount }, { systemKey: cfg.discountKey, credit: discount }, { systemKey: cfg.writeOffKey, credit: writeOff }, { systemKey: cfg.withholdingKey, credit: wh }];
      await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: cfg.sourceType, sourceId: docId, docNo, narration: `${input.paymentType} via ${input.paymentMode}`, lines });
    }
    return docId;
  });
}

export async function getPayment(cfg: PaymentConfig, ctx: Ctx, id: string) {
  const P = cfg.payments;
  const [p] = await db.select().from(P).where(and(eq(P.tenantId!, ctx.tenantId), eq(P.id!, id))) as Record<string, unknown>[];
  if (!p) throw notFound('Payment');
  const allocs = await db.select().from(cfg.allocations).where(eq(cfg.allocations.paymentId!, id)) as Record<string, unknown>[];
  const prim = await db.select().from(cfg.primary.table).where(eq(cfg.primary.table.contactId!, p.contactId as string)) as Record<string, unknown>[];
  const notes = await db.select().from(cfg.note.table).where(eq(cfg.note.table.contactId!, p.contactId as string)) as Record<string, unknown>[];
  const [acc] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, p.paidThroughAccountId as string));
  const [d] = await decorate([p as { contactId: string }]);
  const n = (v: unknown) => Number(v);
  return {
    ...d, amount: n(p.amount), allocatedAmount: n(p.allocatedAmount), advanceApplied: n(p.advanceApplied), advanceUsed: n(p.advanceUsed), paidThroughName: acc?.name, unallocated: r4(n(p.amount) - n(p.allocatedAmount)),
    allocations: allocs.map((a) => {
      const t = (a.targetType === cfg.primary.type ? prim : notes).find((x) => x.id === a.targetId);
      return { ...a, amount: n(a.amount), advanceAmount: n(a.advanceAmount), writeOff: n(a.writeOff), discount: n(a.discount), withholding: n(a.withholding), docNo: t?.docNo, refNo: t?.vendorBillNo ?? null, date: t?.date, total: n(t?.grandTotal), applied: r4(n(a.amount) + n(a.advanceAmount) + n(a.writeOff) + n(a.discount) + n(a.withholding)) };
    }),
  };
}

export async function removePayment(cfg: PaymentConfig, ctx: Ctx, id: string) {
  await db.transaction(async (tx) => {
    const P = cfg.payments;
    const [p] = await tx.select().from(P).where(and(eq(P.tenantId!, ctx.tenantId), eq(P.id!, id))) as Record<string, unknown>[];
    if (!p) throw notFound('Payment');
    if (Number(p.advanceUsed) > 0) throw conflict('Advance from this payment was applied by a later payment');
    const allocs = await tx.select().from(cfg.allocations).where(eq(cfg.allocations.paymentId!, id)) as Record<string, unknown>[];
    for (const a of allocs) {
      const settled = ['amount', 'advanceAmount', 'writeOff', 'discount', 'withholding'].reduce((s, k) => s + Number(a[k]), 0);
      const target = a.targetType === cfg.primary.type ? cfg.primary : cfg.note;
      const [t] = await tx.select().from(target.table).where(eq(target.table.id!, a.targetId as string)) as Record<string, unknown>[];
      if (!t) continue;
      const paid = r4(Number(t[target.paidCol]) - settled);
      await tx.update(target.table).set({ [target.paidCol]: String(paid), status: target === cfg.note ? 'open' : settleStatus(Number(t.grandTotal), paid) } as never).where(eq(target.table.id!, a.targetId as string));
    }
    const apps = await tx.select().from(cfg.advanceApps).where(eq(cfg.advanceApps.paymentId!, id)) as Record<string, unknown>[];
    for (const ap of apps) await tx.update(P).set({ advanceUsed: sql`${P.advanceUsed} - ${ap.amount}` } as never).where(eq(P.id!, ap.sourcePaymentId as string));
    await unpostJournal(tx, cfg.sourceType, id);
    await tx.delete(P).where(eq(P.id!, id));
  });
}
