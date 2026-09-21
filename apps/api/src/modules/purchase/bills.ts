import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { debitNoteSchema, idParam, listQuerySchema, purchaseBillSchema, type DebitNoteInput, type PurchaseBillInput } from '@erp/shared';
import { db, type Tx } from '../../db/client';
import { debitNoteItems, debitNotes, purchaseBillItems, purchaseBills, purchaseOrderItems, purchaseOrders } from '../../db/schema';
import { docHeader, listDocuments } from '../../lib/documents';
import { conflict, notFound } from '../../lib/errors';
import { postJournal, stockIn, stockOut, unpostJournal, unpostStock } from '../../lib/ledger';
import { decorate, dueDateFor, gstLines, lineToRow, resolveLines, totalsToRow } from '../../lib/party-doc';
import type { Ctx } from '../../lib/context';
import { readDoc } from './common';

const PB = 'purchase_bill', DN = 'debit_note';
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Purchase Bill (open): stock IN per tracked line at NET rate (after discount, before tax),
 * journal: Inventory / purchase account Dr, Input GST Dr, Shipping Dr, TCS receivable Dr,
 *          Accounts Payable Cr (vendor), TDS payable Cr.
 */
async function createBill(ctx: Ctx, input: PurchaseBillInput) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, { ...input, roundOff: false });
    const dueDate = input.dueDate ?? (await dueDateFor(tx, input.date, input.paymentTermsId, input.contactId));
    const [doc] = await tx.insert(purchaseBills).values({ ...(await docHeader(tx, ctx, input)), contactId: input.contactId, shippingAddressId: input.shippingAddressId ?? null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate),
      taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate), ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, vendorBillNo: input.vendorBillNo, purchaseOrderId: input.purchaseOrderId ?? null,
      salesPersonId: input.salesPersonId ?? null, paymentTermsId: input.paymentTermsId ?? null, dueDate, shippingCharges: String(input.shippingCharges), status: input.status }).returning();

    const poLinks = new Map<string, number>();   // PO item → billed qty
    let inventory = 0; const expense: { accountId: string; amount: number }[] = [];
    for (const [i, l] of r.lines.entries()) {
      const src = { purchaseOrderItemId: input.items[i]?.sourceLineId ?? undefined };
      const [line] = await tx.insert(purchaseBillItems).values({ ...lineToRow(l, i), billId: doc!.id, purchaseOrderItemId: src.purchaseOrderItemId ?? null }).returning({ id: purchaseBillItems.id });
      if (src.purchaseOrderItemId) poLinks.set(src.purchaseOrderItemId, (poLinks.get(src.purchaseOrderItemId) ?? 0) + l.qty);
      if (input.status !== 'open') continue;
      if (l.inventoryTracked && l.productType === 'goods') {
        await stockIn(tx, ctx, { firmId: input.firmId, branchId: input.branchId, variantId: l.variantId, date: input.date, qty: l.qty, pcs: l.pcs, rate: l.taxable / l.qty, sourceType: PB, sourceId: doc!.id, sourceLineId: line!.id, contactId: input.contactId, docNo: doc!.docNo });
        inventory += l.taxable;
      } else {
        expense.push({ accountId: l.accountId ?? l.purchaseAccountId!, amount: l.taxable });
      }
    }
    if (input.status === 'open') {
      const t = r.totals;
      await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: PB, sourceId: doc!.id, docNo: doc!.docNo, narration: `Bill ${input.vendorBillNo}`, lines: [
        { systemKey: 'inventory_asset', debit: inventory },
        ...expense.map((e) => ({ accountId: e.accountId, debit: e.amount })),
        ...gstLines(t.taxTotal, r.interstate, 'input'),
        { systemKey: 'shipping_expense', debit: t.shipping },
        { systemKey: 'adjustment', debit: t.adjustment > 0 ? t.adjustment : 0, credit: t.adjustment < 0 ? -t.adjustment : 0 },
        { systemKey: 'tcs_receivable', debit: input.withholdingType === 'tcs' ? t.withholding : 0 },
        { systemKey: 'tds_payable', credit: input.withholdingType === 'tds' ? -t.withholding : 0 },
        { systemKey: 'accounts_payable', contactId: input.contactId, credit: t.grandTotal },
      ] });
      await applyPoBilling(tx, poLinks, 1);
    }
    return doc!.id;
  });
}

/** Updates billed_qty on PO items and rolls PO status (open → partial → billed). */
async function applyPoBilling(tx: Tx, links: Map<string, number>, sign: 1 | -1) {
  if (!links.size) return;
  for (const [itemId, qty] of links) await tx.update(purchaseOrderItems).set({ billedQty: sql`${purchaseOrderItems.billedQty} + ${sign * qty}` }).where(eq(purchaseOrderItems.id, itemId));
  const items = await tx.select({ orderId: purchaseOrderItems.orderId }).from(purchaseOrderItems).where(inArray(purchaseOrderItems.id, [...links.keys()]));
  for (const orderId of new Set(items.map((i) => i.orderId))) {
    const rows = await tx.select({ qty: purchaseOrderItems.qty, billed: purchaseOrderItems.billedQty }).from(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, orderId));
    const billed = rows.reduce((s, x) => s + Number(x.billed), 0), total = rows.reduce((s, x) => s + Number(x.qty), 0);
    await tx.update(purchaseOrders).set({ status: billed <= 0 ? 'open' : billed >= total ? 'billed' : 'partial' }).where(eq(purchaseOrders.id, orderId));
  }
}

/** Debit Note (open): AP Dr; amountOnly → line account Cr; else stock OUT at FIFO, Inventory Cr, variance for the difference. */
async function createDebitNote(ctx: Ctx, input: DebitNoteInput) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, { ...input, roundOff: false });
    const [doc] = await tx.insert(debitNotes).values({ ...(await docHeader(tx, ctx, input)), contactId: input.contactId, shippingAddressId: null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate),
      taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate), ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, purchaseBillId: input.purchaseBillId ?? null, reason: input.reason ?? null, amountOnly: input.amountOnly, status: input.status }).returning();
    let cost = 0; const credits: { accountId: string; amount: number }[] = [];
    for (const [i, l] of r.lines.entries()) {
      const [line] = await tx.insert(debitNoteItems).values({ ...lineToRow(l, i), noteId: doc!.id }).returning({ id: debitNoteItems.id });
      if (input.status !== 'open') continue;
      if (!input.amountOnly && l.inventoryTracked && l.productType === 'goods') {
        const out = await stockOut(tx, ctx, { firmId: input.firmId, branchId: input.branchId, variantId: l.variantId, date: input.date, qty: l.qty, pcs: l.pcs, sourceType: DN, sourceId: doc!.id, sourceLineId: line!.id, contactId: input.contactId, docNo: doc!.docNo });
        await tx.update(debitNoteItems).set({ costValue: String(out.value) }).where(eq(debitNoteItems.id, line!.id));
        cost += out.value;
      } else {
        credits.push({ accountId: l.accountId ?? l.purchaseAccountId!, amount: l.taxable });
      }
    }
    if (input.status === 'open') {
      const t = r.totals;
      const netOfTax = t.taxableTotal + t.withholding + t.adjustment;
      await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: DN, sourceId: doc!.id, docNo: doc!.docNo, narration: input.reason, lines: [
        { systemKey: 'accounts_payable', contactId: input.contactId, debit: t.grandTotal },
        { systemKey: 'inventory_asset', credit: cost },
        ...credits.map((c) => ({ accountId: c.accountId, credit: c.amount })),
        ...gstLines(t.taxTotal, r.interstate, 'input').map((g) => ({ ...g, credit: g.debit, debit: 0 })),
        { systemKey: 'purchase_variance', credit: netOfTax - cost - credits.reduce((s, c) => s + c.amount, 0) },
      ] });
    }
    return doc!.id;
  });
}

const billStatus = (grand: number, paid: number) => (paid <= 0 ? 'open' : paid + 0.005 >= grand ? 'paid' : 'partial');

export async function purchaseBillRoutes(app: FastifyInstance) {
  app.get('/purchase/bills', { preHandler: app.authorize('purchase_bill.view') }, async (req) => {
    const p = await listDocuments(purchaseBills, req.ctx, listQuerySchema.parse(req.query));
    const today = new Date().toISOString().slice(0, 10);
    return { ...p, rows: (await decorate(p.rows)).map((r) => ({ ...r, balance: r2(Number(r.grandTotal) - Number(r.paidAmount)), overdue: r.status !== 'paid' && r.status !== 'draft' && !!r.dueDate && r.dueDate < today })) };
  });
  app.get('/purchase/bills/:id', { preHandler: app.authorize('purchase_bill.view') }, async (req) => {
    const d = await readDoc(req.ctx, purchaseBills, purchaseBillItems, purchaseBillItems.billId, idParam.parse(req.params).id, 'Purchase bill');
    return { ...d, balance: r2(Number(d.grandTotal) - Number(d.paidAmount)) };
  });
  app.post('/purchase/bills', { preHandler: app.authorize('purchase_bill.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, purchaseBills, purchaseBillItems, purchaseBillItems.billId, await createBill(req.ctx, purchaseBillSchema.parse(req.body)), 'Purchase bill')));
  app.delete('/purchase/bills/:id', { preHandler: app.authorize('purchase_bill.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.transaction(async (tx) => {
      const [ex] = await tx.select().from(purchaseBills).where(and(eq(purchaseBills.tenantId, req.ctx.tenantId), eq(purchaseBills.id, id)));
      if (!ex) throw notFound('Purchase bill');
      if (Number(ex.paidAmount) > 0) throw conflict('Bill has payments — delete the payments first');
      const [dn] = await tx.select({ id: debitNotes.id }).from(debitNotes).where(eq(debitNotes.purchaseBillId, id)).limit(1);
      if (dn) throw conflict('Bill has a debit note against it');
      const items = await tx.select({ poi: purchaseBillItems.purchaseOrderItemId, qty: purchaseBillItems.qty }).from(purchaseBillItems).where(eq(purchaseBillItems.billId, id));
      await unpostStock(tx, PB, id); await unpostJournal(tx, PB, id);
      await applyPoBilling(tx, new Map(items.filter((i) => i.poi).map((i) => [i.poi!, Number(i.qty)])), -1);
      await tx.delete(purchaseBills).where(eq(purchaseBills.id, id));
    });
    return reply.code(204).send();
  });
  /** Unpaid bills for the payment allocation grid (and the debit-note "Bill No" dropdown). */
  app.get('/purchase/bills/outstanding/:contactId', { preHandler: app.authorize('purchase_bill.view') }, async (req) => {
    const { contactId } = req.params as { contactId: string };
    const q = (req.query as { all?: string });
    const rows = await db.select().from(purchaseBills).where(and(eq(purchaseBills.tenantId, req.ctx.tenantId), eq(purchaseBills.contactId, contactId), q.all === 'true' ? sql`${purchaseBills.status} <> 'draft'` : sql`${purchaseBills.status} in ('open','partial')`)).orderBy(purchaseBills.date);
    return rows.map((b) => ({ id: b.id, docNo: b.docNo, vendorBillNo: b.vendorBillNo, date: b.date, dueDate: b.dueDate, currencyId: b.currencyId, grandTotal: Number(b.grandTotal), paidAmount: Number(b.paidAmount), balance: r2(Number(b.grandTotal) - Number(b.paidAmount)), status: b.status }));
  });

  app.get('/purchase/debit-notes', { preHandler: app.authorize('debit_note.view') }, async (req) => { const p = await listDocuments(debitNotes, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: await decorate(p.rows) }; });
  app.get('/purchase/debit-notes/:id', { preHandler: app.authorize('debit_note.view') }, async (req) => readDoc(req.ctx, debitNotes, debitNoteItems, debitNoteItems.noteId, idParam.parse(req.params).id, 'Debit note'));
  app.post('/purchase/debit-notes', { preHandler: app.authorize('debit_note.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, debitNotes, debitNoteItems, debitNoteItems.noteId, await createDebitNote(req.ctx, debitNoteSchema.parse(req.body)), 'Debit note')));
  app.delete('/purchase/debit-notes/:id', { preHandler: app.authorize('debit_note.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.transaction(async (tx) => {
      const [ex] = await tx.select().from(debitNotes).where(and(eq(debitNotes.tenantId, req.ctx.tenantId), eq(debitNotes.id, id)));
      if (!ex) throw notFound('Debit note');
      if (Number(ex.appliedAmount) > 0) throw conflict('Debit note has been applied in a payment');
      await unpostStock(tx, DN, id); await unpostJournal(tx, DN, id);
      await tx.delete(debitNotes).where(eq(debitNotes.id, id));
    });
    return reply.code(204).send();
  });
  /** Open debit notes for "Debit Note Payment". */
  app.get('/purchase/debit-notes/open/:contactId', { preHandler: app.authorize('debit_note.view') }, async (req) => {
    const { contactId } = req.params as { contactId: string };
    const rows = await db.select().from(debitNotes).where(and(eq(debitNotes.tenantId, req.ctx.tenantId), eq(debitNotes.contactId, contactId), eq(debitNotes.status, 'open'))).orderBy(debitNotes.date);
    return rows.map((n) => ({ id: n.id, docNo: n.docNo, date: n.date, currencyId: n.currencyId, grandTotal: Number(n.grandTotal), paidAmount: Number(n.appliedAmount), balance: r2(Number(n.grandTotal) - Number(n.appliedAmount)), status: n.status }));
  });
}

export { billStatus };
