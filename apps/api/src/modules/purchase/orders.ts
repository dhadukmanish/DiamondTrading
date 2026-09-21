import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { idParam, listQuerySchema, purchaseOrderReturnSchema, purchaseOrderSchema, type PurchaseOrderInput, type PurchaseOrderReturnInput } from '@erp/shared';
import { db } from '../../db/client';
import { purchaseOrderItems, purchaseOrderReturnItems, purchaseOrderReturns, purchaseOrders } from '../../db/schema';
import { docHeader, listDocuments } from '../../lib/documents';
import { conflict, notFound } from '../../lib/errors';
import { postJournal, stockOut, unpostJournal, unpostStock } from '../../lib/ledger';
import { decorate, gstLines, lineToRow, resolveLines, totalsToRow } from '../../lib/party-doc';
import type { Ctx } from '../../lib/context';
import { readDoc } from './common';

const PO = 'purchase_order', POR = 'purchase_order_return';

/** PO: no posting; open orders commit stock (PO Committed). Editable while draft/open and unbilled. */
async function savePO(ctx: Ctx, input: PurchaseOrderInput, id?: string) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, input);
    const body = { contactId: input.contactId, shippingAddressId: input.shippingAddressId ?? null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate), taxType: input.taxType,
      withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate), ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, vendorBillNo: input.vendorBillNo ?? null, expectedDate: input.expectedDate ?? null, status: input.status };
    let poId = id;
    if (id) {
      const [ex] = await tx.select({ status: purchaseOrders.status }).from(purchaseOrders).where(and(eq(purchaseOrders.tenantId, ctx.tenantId), eq(purchaseOrders.id, id)));
      if (!ex) throw notFound('Purchase order');
      if (!['draft', 'open'].includes(ex.status)) throw conflict('Only draft/open orders can be edited');
      await tx.update(purchaseOrders).set({ ...body, date: input.date, referenceNo: input.referenceNo ?? null, notes: input.notes ?? null, updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
      await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, id));
    } else {
      const [doc] = await tx.insert(purchaseOrders).values({ ...(await docHeader(tx, ctx, input)), ...body }).returning({ id: purchaseOrders.id });
      poId = doc!.id;
    }
    await tx.insert(purchaseOrderItems).values(r.lines.map((l, i) => ({ ...lineToRow(l, i), orderId: poId! })));
    return poId!;
  });
}

/** PO Return (standalone): stock OUT at FIFO, AP Dr at document value, GST input reversed, difference → variance. */
async function createPOReturn(ctx: Ctx, input: PurchaseOrderReturnInput) {
  return db.transaction(async (tx) => {
    const r = await resolveLines(tx, ctx.tenantId, input);
    const [doc] = await tx.insert(purchaseOrderReturns).values({ ...(await docHeader(tx, ctx, input)), contactId: input.contactId, shippingAddressId: input.shippingAddressId ?? null, currencyId: input.currencyId, exchangeRate: String(input.exchangeRate),
      taxType: input.taxType, withholdingType: input.withholdingType, withholdingRate: String(input.withholdingRate), ...totalsToRow(r.totals, r.interstate, r.placeOfSupply), totalValue: String(r.totals.grandTotal),
      internalNotes: input.internalNotes ?? null, printableNotes: input.printableNotes ?? null, status: input.status }).returning();
    let cost = 0;
    for (const [i, l] of r.lines.entries()) {
      const [line] = await tx.insert(purchaseOrderReturnItems).values({ ...lineToRow(l, i), returnId: doc!.id }).returning({ id: purchaseOrderReturnItems.id });
      if (input.status === 'confirmed' && l.inventoryTracked) {
        const out = await stockOut(tx, ctx, { firmId: input.firmId, branchId: input.branchId, variantId: l.variantId, date: input.date, qty: l.qty, pcs: l.pcs, sourceType: POR, sourceId: doc!.id, sourceLineId: line!.id, contactId: input.contactId, docNo: doc!.docNo });
        await tx.update(purchaseOrderReturnItems).set({ costValue: String(out.value) }).where(eq(purchaseOrderReturnItems.id, line!.id));
        cost += out.value;
      }
    }
    if (input.status === 'confirmed') {
      const t = r.totals;
      await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: POR, sourceId: doc!.id, docNo: doc!.docNo, narration: `PO return to vendor`, lines: [
        { systemKey: 'accounts_payable', contactId: input.contactId, debit: t.grandTotal },
        { systemKey: 'inventory_asset', credit: cost },
        ...gstLines(t.taxTotal, r.interstate, 'input').map((g) => ({ ...g, credit: g.debit, debit: 0 })),
        { systemKey: 'purchase_variance', credit: t.taxableTotal + t.withholding + t.adjustment - cost },   // price difference between cost and return value
      ] });
    }
    return doc!.id;
  });
}

export async function purchaseOrderRoutes(app: FastifyInstance) {
  app.get('/purchase/orders', { preHandler: app.authorize('purchase_order.view') }, async (req) => {
    const p = await listDocuments(purchaseOrders, req.ctx, listQuerySchema.parse(req.query));
    return { ...p, rows: await decorate(p.rows) };
  });
  app.get('/purchase/orders/:id', { preHandler: app.authorize('purchase_order.view') }, async (req) => readDoc(req.ctx, purchaseOrders, purchaseOrderItems, purchaseOrderItems.orderId, idParam.parse(req.params).id, 'Purchase order'));
  app.post('/purchase/orders', { preHandler: app.authorize('purchase_order.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, purchaseOrders, purchaseOrderItems, purchaseOrderItems.orderId, await savePO(req.ctx, purchaseOrderSchema.parse(req.body)), 'Purchase order')));
  app.put('/purchase/orders/:id', { preHandler: app.authorize('purchase_order.update') }, async (req) => { const { id } = idParam.parse(req.params); await savePO(req.ctx, purchaseOrderSchema.parse(req.body), id); return readDoc(req.ctx, purchaseOrders, purchaseOrderItems, purchaseOrderItems.orderId, id, 'Purchase order'); });
  app.delete('/purchase/orders/:id', { preHandler: app.authorize('purchase_order.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [ex] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders).where(and(eq(purchaseOrders.tenantId, req.ctx.tenantId), eq(purchaseOrders.id, id)));
    if (!ex) throw notFound('Purchase order');
    if (!['draft', 'open'].includes(ex.status)) throw conflict('Billed orders cannot be deleted');
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
    return reply.code(204).send();
  });
  /** Open orders of a vendor with unbilled quantity — "Open Purchase Orders" picker on the bill. */
  app.get('/purchase/orders/open/:contactId', { preHandler: app.authorize('purchase_order.view') }, async (req) => {
    const { contactId } = (req.params as { contactId: string });
    const rows = await db.select({ orderId: purchaseOrders.id, docNo: purchaseOrders.docNo, date: purchaseOrders.date, item: purchaseOrderItems })
      .from(purchaseOrderItems).innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.orderId))
      .where(and(eq(purchaseOrders.tenantId, req.ctx.tenantId), eq(purchaseOrders.contactId, contactId), sql`${purchaseOrders.status} in ('open','partial')`, sql`${purchaseOrderItems.qty} > ${purchaseOrderItems.billedQty}`));
    return rows.map((r) => ({ orderId: r.orderId, docNo: r.docNo, date: r.date, itemId: r.item.id, variantId: r.item.variantId, pendingQty: Number(r.item.qty) - Number(r.item.billedQty), rate: Number(r.item.rate), taxRateId: r.item.taxRateId, discountType: r.item.discountType, discountValue: Number(r.item.discountValue) }));
  });

  app.get('/purchase/order-returns', { preHandler: app.authorize('purchase_order_return.view') }, async (req) => { const p = await listDocuments(purchaseOrderReturns, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: await decorate(p.rows) }; });
  app.get('/purchase/order-returns/:id', { preHandler: app.authorize('purchase_order_return.view') }, async (req) => readDoc(req.ctx, purchaseOrderReturns, purchaseOrderReturnItems, purchaseOrderReturnItems.returnId, idParam.parse(req.params).id, 'PO return'));
  app.post('/purchase/order-returns', { preHandler: app.authorize('purchase_order_return.create') }, async (req, reply) => reply.code(201).send(await readDoc(req.ctx, purchaseOrderReturns, purchaseOrderReturnItems, purchaseOrderReturnItems.returnId, await createPOReturn(req.ctx, purchaseOrderReturnSchema.parse(req.body)), 'PO return')));
  app.delete('/purchase/order-returns/:id', { preHandler: app.authorize('purchase_order_return.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.transaction(async (tx) => {
      const [ex] = await tx.select({ id: purchaseOrderReturns.id }).from(purchaseOrderReturns).where(and(eq(purchaseOrderReturns.tenantId, req.ctx.tenantId), eq(purchaseOrderReturns.id, id)));
      if (!ex) throw notFound('PO return');
      await unpostStock(tx, POR, id); await unpostJournal(tx, POR, id);
      await tx.delete(purchaseOrderReturns).where(eq(purchaseOrderReturns.id, id));
    });
    return reply.code(204).send();
  });
}
