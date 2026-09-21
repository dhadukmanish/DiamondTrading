import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { creditNoteSchema, customerPaymentSchema, idParam, invoiceFollowupSchema, invoiceSchema, listQuerySchema, type CreditNoteInput, type InvoiceInput } from '@erp/shared';
import { db, type Tx } from '../../db/client';
import { contacts, creditNoteItems, creditNotes, customerPaymentAdvanceApplications, customerPaymentAllocations, customerPayments, invoiceFollowups, invoiceItems, invoiceSalesOrders, invoices, salesOrderItems, salesOrders, users } from '../../db/schema';
import { docHeader, listDocuments } from '../../lib/documents';
import { conflict, notFound } from '../../lib/errors';
import { postJournal, stockIn, stockOut, unpostJournal, unpostStock } from '../../lib/ledger';
import { decorate, dueDateFor, gstLines, lineToRow, resolveLines, totalsToRow } from '../../lib/party-doc';
import { availableAdvances, createPayment, getPayment, removePayment, settleStatus, type PaymentConfig } from '../../lib/payments-engine';
import type { Ctx } from '../../lib/context';
import { readDoc } from '../purchase/common';
import { rollSoStatus } from './orders';

const INV = 'invoice', CN = 'credit_note';
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Invoice (open): stock OUT at FIFO per tracked line → COGS Dr / Inventory Cr;
 * AR Dr grand (customer) | Sales Cr taxable (line account), Output GST Cr, TCS payable Cr, TDS receivable Dr, Round-off.
 * Linked SO lines get invoiced_qty; SO rolls open → partial → closed.
 */
async function createInvoice(ctx: Ctx, input: InvoiceInput) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, { ...input, roundOff: true });
    const dueDate = input.dueDate ?? (await dueDateFor(tx, input.date, input.paymentTermsId, input.contactId));
    const [doc] = await tx.insert(invoices).values({ ...(await docHeader(tx, ctx, input)), contactId: input.contactId, shippingAddressId: input.shippingAddressId ?? null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate),
      taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate), ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, consigneeContactId: input.consigneeContactId ?? null, salesPersonId: input.salesPersonId ?? null, paymentTermsId: input.paymentTermsId ?? null, dueDate, termsConditions: input.termsConditions ?? null, status: input.status }).returning();
    const soLinks = new Map<string, { qty: number; pcs: number }>(); let cost = 0; const income: { accountId: string; amount: number }[] = [];
    for (const [i, l] of r.lines.entries()) {
      const soItemId = input.items[i]?.sourceLineId ?? null;
      const [line] = await tx.insert(invoiceItems).values({ ...lineToRow(l, i), invoiceId: doc!.id, salesOrderItemId: soItemId }).returning({ id: invoiceItems.id });
      if (soItemId) { const c = soLinks.get(soItemId) ?? { qty: 0, pcs: 0 }; soLinks.set(soItemId, { qty: c.qty + l.qty, pcs: c.pcs + l.pcs }); }
      if (input.status !== 'open') continue;
      income.push({ accountId: l.accountId ?? l.salesAccountId!, amount: l.taxable });
      if (l.inventoryTracked && l.productType === 'goods') {
        const out = await stockOut(tx, ctx, { firmId: input.firmId, branchId: input.branchId, variantId: l.variantId, date: input.date, qty: l.qty, pcs: l.pcs, sourceType: INV, sourceId: doc!.id, sourceLineId: line!.id, contactId: input.contactId, docNo: doc!.docNo });
        await tx.update(invoiceItems).set({ costValue: String(out.value) }).where(eq(invoiceItems.id, line!.id)); cost += out.value;
      }
    }
    const soIds = new Set(input.salesOrderIds);
    if (soLinks.size) { const rows = await tx.select({ orderId: salesOrderItems.orderId }).from(salesOrderItems).where(sql`${salesOrderItems.id} in ${[...soLinks.keys()]}`); rows.forEach((x) => soIds.add(x.orderId)); }
    if (soIds.size) await tx.insert(invoiceSalesOrders).values([...soIds].map((salesOrderId) => ({ invoiceId: doc!.id, salesOrderId })));
    if (input.status === 'open') {
      const t = r.totals;
      await tx.update(invoices).set({ costTotal: String(cost) }).where(eq(invoices.id, doc!.id));
      await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: INV, sourceId: doc!.id, docNo: doc!.docNo, narration: `Invoice to customer`, lines: [
        { systemKey: 'accounts_receivable', contactId: input.contactId, debit: t.grandTotal },
        ...income.map((x) => ({ accountId: x.accountId, credit: x.amount })),
        ...gstLines(t.taxTotal, r.interstate, 'output'),
        { systemKey: 'tcs_payable', credit: input.withholdingType === 'tcs' ? t.withholding : 0 },
        { systemKey: 'tds_receivable', debit: input.withholdingType === 'tds' ? -t.withholding : 0 },
        { systemKey: 'adjustment', debit: t.adjustment < 0 ? -t.adjustment : 0, credit: t.adjustment > 0 ? t.adjustment : 0 },
        { systemKey: 'rounding_off', debit: t.roundOff < 0 ? -t.roundOff : 0, credit: t.roundOff > 0 ? t.roundOff : 0 },
        { systemKey: 'cogs', debit: cost }, { systemKey: 'inventory_asset', credit: cost },
      ] });
      await applySoInvoicing(tx, soLinks, 1);
    }
    return doc!.id;
  });
}

async function applySoInvoicing(tx: Tx, links: Map<string, { qty: number; pcs: number }>, sign: 1 | -1) {
  for (const [id, v] of links) await tx.update(salesOrderItems).set({ invoicedQty: sql`${salesOrderItems.invoicedQty} + ${sign * v.qty}`, invoicedPcs: sql`${salesOrderItems.invoicedPcs} + ${sign * v.pcs}` }).where(eq(salesOrderItems.id, id));
  if (!links.size) return;
  const rows = await tx.select({ orderId: salesOrderItems.orderId }).from(salesOrderItems).where(sql`${salesOrderItems.id} in ${[...links.keys()]}`);
  for (const o of new Set(rows.map((x) => x.orderId))) await rollSoStatus(tx, o);
}

/** Credit Note (open): AR Cr; amountOnly → sales account Dr; else stock IN at original cost → Inventory Dr / COGS Cr. */
async function createCreditNote(ctx: Ctx, input: CreditNoteInput) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, { ...input, roundOff: true });
    const [doc] = await tx.insert(creditNotes).values({ ...(await docHeader(tx, ctx, input)), contactId: input.contactId, shippingAddressId: null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate),
      taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate), ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, invoiceId: input.invoiceId ?? null, reason: input.reason ?? null, amountOnly: input.amountOnly, status: input.status }).returning();
    let cost = 0; const debits: { accountId: string; amount: number }[] = [];
    const invLines = input.invoiceId ? await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, input.invoiceId)) : [];
    for (const [i, l] of r.lines.entries()) {
      const [line] = await tx.insert(creditNoteItems).values({ ...lineToRow(l, i), noteId: doc!.id }).returning({ id: creditNoteItems.id });
      if (input.status !== 'open') continue;
      debits.push({ accountId: l.accountId ?? l.salesAccountId!, amount: l.taxable });
      if (!input.amountOnly && l.inventoryTracked && l.productType === 'goods') {
        const src = invLines.find((x) => x.variantId === l.variantId);
        const rate = src && Number(src.qty) ? Number(src.costValue) / Number(src.qty) : await lastCost(tx, l.variantId);
        const res = await stockIn(tx, ctx, { firmId: input.firmId, branchId: input.branchId, variantId: l.variantId, date: input.date, qty: l.qty, pcs: l.pcs, rate, sourceType: CN, sourceId: doc!.id, sourceLineId: line!.id, contactId: input.contactId, docNo: doc!.docNo });
        await tx.update(creditNoteItems).set({ costValue: String(res.value) }).where(eq(creditNoteItems.id, line!.id)); cost += res.value;
      }
    }
    if (input.status === 'open') {
      const t = r.totals;
      await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: CN, sourceId: doc!.id, docNo: doc!.docNo, narration: input.reason, lines: [
        ...debits.map((x) => ({ accountId: x.accountId, debit: x.amount })),
        ...gstLines(t.taxTotal, r.interstate, 'output').map((g) => ({ ...g, debit: g.credit, credit: 0 })),
        { systemKey: 'rounding_off', debit: t.roundOff > 0 ? t.roundOff : 0, credit: t.roundOff < 0 ? -t.roundOff : 0 },
        { systemKey: 'adjustment', debit: t.adjustment > 0 ? t.adjustment : 0, credit: t.adjustment < 0 ? -t.adjustment : 0 },
        { systemKey: 'accounts_receivable', contactId: input.contactId, credit: t.grandTotal },
        { systemKey: 'inventory_asset', debit: cost }, { systemKey: 'cogs', credit: cost },
      ] });
    }
    return doc!.id;
  });
}
async function lastCost(tx: Tx, variantId: string) {
  const { stockMovements } = await import('../../db/schema');
  const [m] = await tx.select({ rate: stockMovements.rate }).from(stockMovements).where(and(eq(stockMovements.variantId, variantId), eq(stockMovements.direction, 'in'))).orderBy(desc(stockMovements.date), desc(stockMovements.createdAt)).limit(1);
  return m ? Number(m.rate) : 0;
}

const CP: PaymentConfig = {
  side: 'receivable', sourceType: 'customer_payment', payments: customerPayments as never, allocations: customerPaymentAllocations as never, advanceApps: customerPaymentAdvanceApplications as never,
  primary: { table: invoices as never, paidCol: 'paidAmount', type: 'invoice' }, note: { table: creditNotes as never, paidCol: 'appliedAmount', type: 'credit_note' },
  inflowTypes: ['payment', 'advance'], noteType: 'credit_note_payment', partyKey: 'accounts_receivable', discountKey: 'discount_allowed', writeOffKey: 'bad_debts', withholdingKey: 'tds_receivable',
};

export async function invoiceRoutes(app: FastifyInstance) {
  const today = () => new Date().toISOString().slice(0, 10);
  app.get('/sales/invoices', { preHandler: app.authorize('invoice.view') }, async (req) => {
    const p = await listDocuments(invoices, req.ctx, listQuerySchema.parse(req.query));
    return { ...p, rows: (await decorate(p.rows)).map((r) => ({ ...r, balance: r2(Number(r.grandTotal) - Number(r.paidAmount)), overdue: ['open', 'partial'].includes(r.status) && !!r.dueDate && r.dueDate < today() })) };
  });
  const getInvoice = async (ctx: Ctx, id: string) => {
    const d = await readDoc(ctx, invoices, invoiceItems, invoiceItems.invoiceId, id, 'Invoice');
    const sos = await db.select({ docNo: salesOrders.docNo, id: salesOrders.id }).from(invoiceSalesOrders).innerJoin(salesOrders, eq(salesOrders.id, invoiceSalesOrders.salesOrderId)).where(eq(invoiceSalesOrders.invoiceId, d.id));
    return { ...d, balance: r2(Number(d.grandTotal) - Number(d.paidAmount)), linkedSalesOrders: sos };
  };
  app.get('/sales/invoices/:id', { preHandler: app.authorize('invoice.view') }, async (req) => getInvoice(req.ctx, idParam.parse(req.params).id));
  app.post('/sales/invoices', { preHandler: app.authorize('invoice.create') }, async (req, reply) => reply.code(201).send(await getInvoice(req.ctx, await createInvoice(req.ctx, invoiceSchema.parse(req.body)))));
  app.delete('/sales/invoices/:id', { preHandler: app.authorize('invoice.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.transaction(async (tx) => {
      const [ex] = await tx.select().from(invoices).where(and(eq(invoices.tenantId, req.ctx.tenantId), eq(invoices.id, id)));
      if (!ex) throw notFound('Invoice');
      if (Number(ex.paidAmount) > 0) throw conflict('Invoice has receipts — delete them first');
      const [cn] = await tx.select({ id: creditNotes.id }).from(creditNotes).where(eq(creditNotes.invoiceId, id)).limit(1);
      if (cn) throw conflict('Invoice has a credit note against it');
      const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await unpostStock(tx, INV, id); await unpostJournal(tx, INV, id);
      await applySoInvoicing(tx, new Map(items.filter((i) => i.salesOrderItemId).map((i) => [i.salesOrderItemId!, { qty: Number(i.qty), pcs: i.pcs }])), -1);
      await tx.delete(invoices).where(eq(invoices.id, id));
    });
    return reply.code(204).send();
  });
  app.get('/sales/invoices/outstanding/:contactId', { preHandler: app.authorize('invoice.view') }, async (req) => {
    const { contactId } = req.params as { contactId: string }; const q = req.query as { all?: string };
    const rows = await db.select().from(invoices).where(and(eq(invoices.tenantId, req.ctx.tenantId), eq(invoices.contactId, contactId), q.all === 'true' ? sql`${invoices.status} <> 'draft'` : sql`${invoices.status} in ('open','partial')`)).orderBy(invoices.date);
    return rows.map((b) => ({ id: b.id, docNo: b.docNo, date: b.date, dueDate: b.dueDate, currencyId: b.currencyId, grandTotal: Number(b.grandTotal), paidAmount: Number(b.paidAmount), balance: r2(Number(b.grandTotal) - Number(b.paidAmount)), status: b.status }));
  });

  // follow-ups
  app.get('/sales/invoices/:id/followups', { preHandler: app.authorize('invoice.view') }, async (req) => {
    const rows = await db.select({ f: invoiceFollowups, by: users.name }).from(invoiceFollowups).leftJoin(users, eq(users.id, invoiceFollowups.createdBy)).where(eq(invoiceFollowups.invoiceId, idParam.parse(req.params).id)).orderBy(desc(invoiceFollowups.createdAt));
    return rows.map(({ f, by }) => ({ ...f, createdByName: by }));
  });
  app.post('/sales/invoices/:id/followups', { preHandler: app.authorize('invoice.update') }, async (req, reply) => {
    const { id } = idParam.parse(req.params); const b = invoiceFollowupSchema.parse(req.body);
    const [r] = await db.insert(invoiceFollowups).values({ invoiceId: id, outcome: b.outcome, channel: b.channel, comment: b.comment ?? null, nextFollowupAt: b.nextFollowupAt ? new Date(b.nextFollowupAt) : null, createdBy: req.ctx.userId }).returning();
    return reply.code(201).send(r);
  });

  // credit notes
  app.get('/sales/credit-notes', { preHandler: app.authorize('credit_note.view') }, async (req) => { const p = await listDocuments(creditNotes, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: await decorate(p.rows) }; });
  app.get('/sales/credit-notes/:id', { preHandler: app.authorize('credit_note.view') }, async (req) => readDoc(req.ctx, creditNotes, creditNoteItems, creditNoteItems.noteId, idParam.parse(req.params).id, 'Credit note'));
  app.post('/sales/credit-notes', { preHandler: app.authorize('credit_note.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, creditNotes, creditNoteItems, creditNoteItems.noteId, await createCreditNote(req.ctx, creditNoteSchema.parse(req.body)), 'Credit note')));
  app.delete('/sales/credit-notes/:id', { preHandler: app.authorize('credit_note.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.transaction(async (tx) => {
      const [ex] = await tx.select().from(creditNotes).where(and(eq(creditNotes.tenantId, req.ctx.tenantId), eq(creditNotes.id, id)));
      if (!ex) throw notFound('Credit note');
      if (Number(ex.appliedAmount) > 0) throw conflict('Credit note has been applied');
      await unpostStock(tx, CN, id); await unpostJournal(tx, CN, id);
      await tx.delete(creditNotes).where(eq(creditNotes.id, id));
    });
    return reply.code(204).send();
  });
  app.get('/sales/credit-notes/open/:contactId', { preHandler: app.authorize('credit_note.view') }, async (req) => {
    const { contactId } = req.params as { contactId: string };
    const rows = await db.select().from(creditNotes).where(and(eq(creditNotes.tenantId, req.ctx.tenantId), eq(creditNotes.contactId, contactId), eq(creditNotes.status, 'open'))).orderBy(creditNotes.date);
    return rows.map((n) => ({ id: n.id, docNo: n.docNo, date: n.date, currencyId: n.currencyId, grandTotal: Number(n.grandTotal), paidAmount: Number(n.appliedAmount), balance: r2(Number(n.grandTotal) - Number(n.appliedAmount)), status: n.status }));
  });

  // customer payments
  app.get('/sales/payments', { preHandler: app.authorize('customer_payment.view') }, async (req) => { const p = await listDocuments(customerPayments, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: (await decorate(p.rows)).map((r) => ({ ...r, amount: Number(r.amount) })) }; });
  app.get('/sales/payments/:id', { preHandler: app.authorize('customer_payment.view') }, async (req) => getPayment(CP, req.ctx, idParam.parse(req.params).id));
  app.post('/sales/payments', { preHandler: app.authorize('customer_payment.create') }, async (req, reply) => reply.code(201).send(await getPayment(CP, req.ctx, await createPayment(CP, req.ctx, customerPaymentSchema.parse(req.body)))));
  app.delete('/sales/payments/:id', { preHandler: app.authorize('customer_payment.delete') }, async (req, reply) => { await removePayment(CP, req.ctx, idParam.parse(req.params).id); return reply.code(204).send(); });
  app.get('/sales/payments/advances/:contactId', { preHandler: app.authorize('customer_payment.view') }, async (req) => { const list = await availableAdvances(CP, db as never, req.ctx.tenantId, (req.params as { contactId: string }).contactId); return { total: r2(list.reduce((s, a) => s + a.available, 0)), payments: list }; });

  /** Customer / vendor summary drawer: receivables, payables, outstanding memo, GST, addresses, persons. */
  app.get('/contacts/:id/summary', { preHandler: app.authenticate }, async (req) => {
    const { id } = idParam.parse(req.params);
    const [c] = await db.select().from(contacts).where(and(eq(contacts.tenantId, req.ctx.tenantId), eq(contacts.id, id)));
    if (!c) throw notFound('Contact');
    const [ar] = await db.select({ v: sql<number>`coalesce(sum(${invoices.grandTotal} - ${invoices.paidAmount}),0)::float` }).from(invoices).where(and(eq(invoices.contactId, id), sql`${invoices.status} in ('open','partial')`));
    const [memo] = await db.select({ v: sql<number>`coalesce(sum((${salesOrderItems.qty} - ${salesOrderItems.invoicedQty} - ${salesOrderItems.returnedQty} - ${salesOrderItems.lossQty}) * ${salesOrderItems.rate}),0)::float` }).from(salesOrderItems).innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId)).where(and(eq(salesOrders.contactId, id), sql`${salesOrders.status} in ('open','partial')`));
    const { purchaseBills } = await import('../../db/schema');
    const [ap] = await db.select({ v: sql<number>`coalesce(sum(${purchaseBills.grandTotal} - ${purchaseBills.paidAmount}),0)::float` }).from(purchaseBills).where(and(eq(purchaseBills.contactId, id), sql`${purchaseBills.status} in ('open','partial')`));
    const [inv] = await db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.contactId, id), sql`${invoices.status} in ('open','partial')`));
    return { id: c.id, displayName: c.displayName, primaryContactPerson: c.primaryContactPerson, type: c.type, gstTreatment: c.gstTreatment, gstin: c.gstin, billing: { address: c.billAddress, pincode: c.billPincode }, mobile: c.mobile, email: c.email,
      outstandingReceivables: r2(ar?.v ?? 0), outstandingPayables: r2(ap?.v ?? 0), outstandingMemo: r2(memo?.v ?? 0), unpaidInvoices: inv?.n ?? 0 };
  });
  void settleStatus;
}
