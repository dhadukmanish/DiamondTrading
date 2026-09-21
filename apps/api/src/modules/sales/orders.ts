import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { estimateSchema, idParam, listQuerySchema, salesOrderReturnSchema, salesOrderSchema, type EstimateInput, type SalesOrderInput, type SalesOrderReturnInput } from '@erp/shared';
import { db, type Tx } from '../../db/client';
import { estimateItems, estimates, salesOrderItems, salesOrderReturnItems, salesOrderReturns, salesOrders } from '../../db/schema';
import { docHeader, listDocuments } from '../../lib/documents';
import { conflict, notFound, badRequest } from '../../lib/errors';
import { postJournal, stockOut, unpostJournal, unpostStock } from '../../lib/ledger';
import { decorate, lineToRow, resolveLines, totalsToRow } from '../../lib/party-doc';
import type { Ctx } from '../../lib/context';
import { readDoc } from '../purchase/common';
import { variantInfo } from '../inventory/variants';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

async function saveEstimate(ctx: Ctx, input: EstimateInput, id?: string) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, { ...input, roundOff: true });
    const body = { contactId: input.contactId, shippingAddressId: input.shippingAddressId ?? null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate), taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate),
      ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal), internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null,
      validUntil: input.validUntil ?? null, salesPersonId: input.salesPersonId ?? null, paymentTermsId: input.paymentTermsId ?? null, detailHtml: input.detailHtml ?? null, status: input.status };
    let eid = id;
    if (id) {
      const [ex] = await tx.update(estimates).set({ ...body, date: input.date, referenceNo: input.referenceNo ?? null, updatedAt: new Date() }).where(and(eq(estimates.tenantId, ctx.tenantId), eq(estimates.id, id), sql`${estimates.status} <> 'closed'`)).returning({ id: estimates.id });
      if (!ex) throw conflict('Closed estimates cannot be edited');
      await tx.delete(estimateItems).where(eq(estimateItems.estimateId, id));
    } else { const [d] = await tx.insert(estimates).values({ ...(await docHeader(tx, ctx, input)), ...body }).returning({ id: estimates.id }); eid = d!.id; }
    await tx.insert(estimateItems).values(r.lines.map((l, i) => ({ ...lineToRow(l, i), estimateId: eid! })));
    return eid!;
  });
}

/** Sales Order: open = stock committed (memo). Nothing posts until invoice / return. */
async function saveSO(ctx: Ctx, input: SalesOrderInput, id?: string) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, { ...input, roundOff: true });
    const body = { contactId: input.contactId, shippingAddressId: input.shippingAddressId ?? null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate), taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate),
      ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal), internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, expectedDate: input.expectedDate ?? null, paymentTermsId: input.paymentTermsId ?? null, status: input.status };
    let sid = id;
    if (id) {
      const [ex] = await tx.select({ status: salesOrders.status }).from(salesOrders).where(and(eq(salesOrders.tenantId, ctx.tenantId), eq(salesOrders.id, id)));
      if (!ex) throw notFound('Sales order');
      if (!['draft', 'open'].includes(ex.status)) throw conflict('Only draft/open orders can be edited');
      await tx.update(salesOrders).set({ ...body, date: input.date, referenceNo: input.referenceNo ?? null, updatedAt: new Date() }).where(eq(salesOrders.id, id));
      await tx.delete(salesOrderItems).where(eq(salesOrderItems.orderId, id));
    } else { const [d] = await tx.insert(salesOrders).values({ ...(await docHeader(tx, ctx, input)), ...body }).returning({ id: salesOrders.id }); sid = d!.id; }
    await tx.insert(salesOrderItems).values(r.lines.map((l, i) => ({ ...lineToRow(l, i), orderId: sid! })));
    return sid!;
  });
}

/** Open → partial → closed by invoiced+returned+loss vs qty. Cancelled stays. */
export async function rollSoStatus(tx: Tx, orderId: string) {
  const items = await tx.select().from(salesOrderItems).where(eq(salesOrderItems.orderId, orderId));
  const total = items.reduce((s, i) => s + Number(i.qty), 0);
  const done = items.reduce((s, i) => s + Number(i.invoicedQty) + Number(i.returnedQty) + Number(i.lossQty), 0);
  const [so] = await tx.select({ status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.id, orderId));
  if (!so || so.status === 'draft' || so.status === 'cancelled') return;
  await tx.update(salesOrders).set({ status: done <= 0 ? 'open' : done + 0.0001 >= total ? 'closed' : 'partial' }).where(eq(salesOrders.id, orderId));
}

/** Return Stock: returned qty releases the commitment; loss qty leaves stock (Stock Adjustment Loss journal). */
async function createSOReturn(ctx: Ctx, input: SalesOrderReturnInput) {
  return db.transaction(async (tx) => {
    const [so] = await tx.select().from(salesOrders).where(and(eq(salesOrders.tenantId, ctx.tenantId), eq(salesOrders.id, input.salesOrderId)));
    if (!so) throw notFound('Sales order');
    const [doc] = await tx.insert(salesOrderReturns).values({ ...(await docHeader(tx, ctx, { firmId: so.firmId, branchId: so.branchId, seriesId: input.seriesId, number: input.number, date: input.date, notes: input.notes })), contactId: so.contactId, salesOrderId: so.id, status: 'confirmed' }).returning();
    let loss = 0;
    for (const it of input.items) {
      const [soi] = await tx.select().from(salesOrderItems).where(eq(salesOrderItems.id, it.salesOrderItemId));
      if (!soi || soi.orderId !== so.id) throw badRequest('Line does not belong to this order');
      const pending = r4(Number(soi.qty) - Number(soi.invoicedQty) - Number(soi.returnedQty) - Number(soi.lossQty));
      if (it.returnQty + it.lossQty > pending + 0.0001) throw badRequest(`Return + loss exceeds pending ${pending}`);
      if (it.returnQty <= 0 && it.lossQty <= 0) continue;
      let lossValue = 0;
      if (it.lossQty > 0) {
        const out = await stockOut(tx, ctx, { firmId: so.firmId, branchId: so.branchId, variantId: soi.variantId, date: input.date, qty: it.lossQty, pcs: it.lossPcs, sourceType: 'sales_order_return', sourceId: doc!.id, contactId: so.contactId, docNo: doc!.docNo, note: 'Memo loss' });
        lossValue = out.value; loss += out.value;
      }
      await tx.insert(salesOrderReturnItems).values({ returnId: doc!.id, salesOrderItemId: soi.id, variantId: soi.variantId, returnQty: String(it.returnQty), returnPcs: it.returnPcs, lossQty: String(it.lossQty), lossPcs: it.lossPcs, lossValue: String(lossValue) });
      await tx.update(salesOrderItems).set({ returnedQty: sql`${salesOrderItems.returnedQty} + ${it.returnQty}`, returnedPcs: sql`${salesOrderItems.returnedPcs} + ${it.returnPcs}`, lossQty: sql`${salesOrderItems.lossQty} + ${it.lossQty}`, lossPcs: sql`${salesOrderItems.lossPcs} + ${it.lossPcs}` }).where(eq(salesOrderItems.id, soi.id));
    }
    await tx.update(salesOrderReturns).set({ totalValue: String(loss) }).where(eq(salesOrderReturns.id, doc!.id));
    if (loss > 0) await postJournal(tx, ctx, { firmId: so.firmId, branchId: so.branchId, date: input.date, sourceType: 'sales_order_return', sourceId: doc!.id, docNo: doc!.docNo, narration: 'Memo loss', lines: [{ systemKey: 'stock_adjustment_loss', debit: loss }, { systemKey: 'inventory_asset', credit: loss }] });
    await rollSoStatus(tx, so.id);
    return doc!.id;
  });
}

export async function salesOrderRoutes(app: FastifyInstance) {
  // estimates
  app.get('/sales/estimates', { preHandler: app.authorize('estimate.view') }, async (req) => { const p = await listDocuments(estimates, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: await decorate(p.rows) }; });
  app.get('/sales/estimates/:id', { preHandler: app.authorize('estimate.view') }, async (req) => readDoc(req.ctx, estimates, estimateItems, estimateItems.estimateId, idParam.parse(req.params).id, 'Estimate'));
  app.post('/sales/estimates', { preHandler: app.authorize('estimate.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, estimates, estimateItems, estimateItems.estimateId, await saveEstimate(req.ctx, estimateSchema.parse(req.body)), 'Estimate')));
  app.put('/sales/estimates/:id', { preHandler: app.authorize('estimate.update') }, async (req) => { const { id } = idParam.parse(req.params); await saveEstimate(req.ctx, estimateSchema.parse(req.body), id); return readDoc(req.ctx, estimates, estimateItems, estimateItems.estimateId, id, 'Estimate'); });
  app.delete('/sales/estimates/:id', { preHandler: app.authorize('estimate.delete') }, async (req, reply) => { const [r] = await db.delete(estimates).where(and(eq(estimates.tenantId, req.ctx.tenantId), eq(estimates.id, idParam.parse(req.params).id))).returning({ id: estimates.id }); if (!r) throw notFound('Estimate'); return reply.code(204).send(); });

  // sales orders
  app.get('/sales/orders', { preHandler: app.authorize('sales_order.view') }, async (req) => { const p = await listDocuments(salesOrders, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: await decorate(p.rows) }; });
  app.get('/sales/orders/:id', { preHandler: app.authorize('sales_order.view') }, async (req) => {
    const d = await readDoc(req.ctx, salesOrders, salesOrderItems, salesOrderItems.orderId, idParam.parse(req.params).id, 'Sales order');
    return { ...d, items: d.items.map((i) => { const x = i as unknown as Record<string, unknown>; const n = (k: string) => Number(x[k]); return { ...i, invoicedQty: n('invoicedQty'), returnedQty: n('returnedQty'), lossQty: n('lossQty'), pendingQty: r4(n('qty') - n('invoicedQty') - n('returnedQty') - n('lossQty')), pendingPcs: (x.pcs as number) - (x.invoicedPcs as number) - (x.returnedPcs as number) - (x.lossPcs as number) }; }) };
  });
  app.post('/sales/orders', { preHandler: app.authorize('sales_order.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, salesOrders, salesOrderItems, salesOrderItems.orderId, await saveSO(req.ctx, salesOrderSchema.parse(req.body)), 'Sales order')));
  app.put('/sales/orders/:id', { preHandler: app.authorize('sales_order.update') }, async (req) => { const { id } = idParam.parse(req.params); await saveSO(req.ctx, salesOrderSchema.parse(req.body), id); return readDoc(req.ctx, salesOrders, salesOrderItems, salesOrderItems.orderId, id, 'Sales order'); });
  app.post('/sales/orders/:id/cancel', { preHandler: app.authorize('sales_order.update') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const [r] = await db.update(salesOrders).set({ status: 'cancelled' }).where(and(eq(salesOrders.tenantId, req.ctx.tenantId), eq(salesOrders.id, id), sql`${salesOrders.status} in ('draft','open')`)).returning({ id: salesOrders.id });
    if (!r) throw conflict('Only draft/open orders can be cancelled');
    return { ok: true };
  });
  app.delete('/sales/orders/:id', { preHandler: app.authorize('sales_order.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [ex] = await db.select({ status: salesOrders.status }).from(salesOrders).where(and(eq(salesOrders.tenantId, req.ctx.tenantId), eq(salesOrders.id, id)));
    if (!ex) throw notFound('Sales order');
    if (!['draft', 'open', 'cancelled'].includes(ex.status)) throw conflict('Invoiced orders cannot be deleted');
    await db.delete(salesOrders).where(eq(salesOrders.id, id));
    return reply.code(204).send();
  });
  /** Open SO lines of a customer with pending qty — invoice "Open Sales Orders" picker. */
  app.get('/sales/orders/open/:contactId', { preHandler: app.authorize('sales_order.view') }, async (req) => {
    const { contactId } = req.params as { contactId: string };
    const rows = await db.select({ orderId: salesOrders.id, docNo: salesOrders.docNo, date: salesOrders.date, item: salesOrderItems }).from(salesOrderItems).innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
      .where(and(eq(salesOrders.tenantId, req.ctx.tenantId), eq(salesOrders.contactId, contactId), sql`${salesOrders.status} in ('open','partial')`));
    const info = await variantInfo(req.ctx, rows.map((r) => r.item.variantId));
    return rows.map((r) => ({ orderId: r.orderId, docNo: r.docNo, date: r.date, itemId: r.item.id, variantId: r.item.variantId, variant: info.get(r.item.variantId), pendingQty: r4(Number(r.item.qty) - Number(r.item.invoicedQty) - Number(r.item.returnedQty) - Number(r.item.lossQty)), pendingPcs: r.item.pcs - r.item.invoicedPcs - r.item.returnedPcs - r.item.lossPcs, rate: Number(r.item.rate), taxRateId: r.item.taxRateId, discountType: r.item.discountType, discountValue: Number(r.item.discountValue) })).filter((x) => x.pendingQty > 0);
  });

  // returns
  app.post('/sales/order-returns', { preHandler: app.authorize('sales_order_return.create') }, async (req, reply) => { const id = await createSOReturn(req.ctx, salesOrderReturnSchema.parse(req.body)); return reply.code(201).send({ id }); });
  app.get('/sales/order-returns', { preHandler: app.authorize('sales_order_return.view') }, async (req) => { const p = await listDocuments(salesOrderReturns, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: await decorate(p.rows) }; });
  app.get('/sales/orders/:id/returns', { preHandler: app.authorize('sales_order_return.view') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const docs = await db.select().from(salesOrderReturns).where(and(eq(salesOrderReturns.tenantId, req.ctx.tenantId), eq(salesOrderReturns.salesOrderId, id))).orderBy(asc(salesOrderReturns.date));
    const items = docs.length ? await db.select().from(salesOrderReturnItems).where(inArray(salesOrderReturnItems.returnId, docs.map((d) => d.id))) : [];
    return docs.map((d) => ({ ...d, items: items.filter((i) => i.returnId === d.id).map((i) => ({ ...i, returnQty: Number(i.returnQty), lossQty: Number(i.lossQty), lossValue: Number(i.lossValue) })) }));
  });
  app.delete('/sales/order-returns/:id', { preHandler: app.authorize('sales_order_return.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.transaction(async (tx) => {
      const [d] = await tx.select().from(salesOrderReturns).where(and(eq(salesOrderReturns.tenantId, req.ctx.tenantId), eq(salesOrderReturns.id, id)));
      if (!d) throw notFound('Return');
      const items = await tx.select().from(salesOrderReturnItems).where(eq(salesOrderReturnItems.returnId, id));
      for (const i of items) await tx.update(salesOrderItems).set({ returnedQty: sql`${salesOrderItems.returnedQty} - ${i.returnQty}`, returnedPcs: sql`${salesOrderItems.returnedPcs} - ${i.returnPcs}`, lossQty: sql`${salesOrderItems.lossQty} - ${i.lossQty}`, lossPcs: sql`${salesOrderItems.lossPcs} - ${i.lossPcs}` }).where(eq(salesOrderItems.id, i.salesOrderItemId));
      await unpostStock(tx, 'sales_order_return', id); await unpostJournal(tx, 'sales_order_return', id);
      await tx.delete(salesOrderReturns).where(eq(salesOrderReturns.id, id));
      await rollSoStatus(tx, d.salesOrderId);
    });
    return reply.code(204).send();
  });
}
