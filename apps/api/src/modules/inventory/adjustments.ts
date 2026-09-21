import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { idParam, listQuerySchema, stockAdjustmentSchema, type StockAdjustmentInput } from '@erp/shared';
import { db } from '../../db/client';
import { stockAdjustmentItems, stockAdjustments } from '../../db/schema';
import { docHeader, listDocuments } from '../../lib/documents';
import { notFound } from '../../lib/errors';
import { postJournal, stockIn, stockLevels, stockOut, unpostJournal, unpostStock } from '../../lib/ledger';
import type { Ctx } from '../../lib/context';
import { variantInfo } from './variants';

const SRC = 'stock_adjustment';

/**
 * Quantity adjustment. +qty = stock IN at given rate (Inventory Dr / Stock Adjustment Gain Cr);
 * −qty = stock OUT at FIFO cost (Stock Adjustment Loss Dr / Inventory Cr).
 */
async function create(ctx: Ctx, input: StockAdjustmentInput) {
  return db.transaction(async (tx) => {
    const header = await docHeader(tx, ctx, input);
    const [doc] = await tx.insert(stockAdjustments).values({ ...header, mode: input.mode, status: 'posted' }).returning();
    const levels = await stockLevels(tx, ctx.tenantId, { branchId: input.branchId, variantIds: input.items.map((i) => i.variantId) });
    let gain = 0, loss = 0, total = 0;

    for (const [i, it] of input.items.entries()) {
      const available = levels.find((l) => l.variantId === it.variantId)?.qty ?? 0;
      const [line] = await tx.insert(stockAdjustmentItems).values({
        adjustmentId: doc!.id, variantId: it.variantId, qtyAvailable: String(available), qtyAdjusted: String(it.qtyAdjusted), pcsAdjusted: it.pcsAdjusted, rate: String(it.rate), sortOrder: i,
      }).returning({ id: stockAdjustmentItems.id });
      const base = { firmId: input.firmId, branchId: input.branchId, variantId: it.variantId, date: input.date, sourceType: SRC, sourceId: doc!.id, sourceLineId: line!.id, docNo: doc!.docNo };
      const res = it.qtyAdjusted > 0
        ? await stockIn(tx, ctx, { ...base, qty: it.qtyAdjusted, pcs: it.pcsAdjusted, rate: it.rate })
        : await stockOut(tx, ctx, { ...base, qty: -it.qtyAdjusted, pcs: -it.pcsAdjusted });
      await tx.update(stockAdjustmentItems).set({ value: String(res.value), rate: String(res.rate) }).where(eq(stockAdjustmentItems.id, line!.id));
      if (it.qtyAdjusted > 0) gain += res.value; else loss += res.value;
      total += res.value;
    }
    await tx.update(stockAdjustments).set({ totalValue: String(total) }).where(eq(stockAdjustments.id, doc!.id));
    await postJournal(tx, ctx, {
      firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: SRC, sourceId: doc!.id, docNo: doc!.docNo, narration: input.notes,
      lines: [
        { systemKey: 'inventory_asset', debit: gain, credit: loss },
        { systemKey: 'stock_adjustment_gain', credit: gain },
        { systemKey: 'stock_adjustment_loss', debit: loss },
      ],
    });
    return doc!.id;
  });
}

async function get(ctx: Ctx, id: string) {
  const [doc] = await db.select().from(stockAdjustments).where(and(eq(stockAdjustments.tenantId, ctx.tenantId), eq(stockAdjustments.id, id)));
  if (!doc) throw notFound('Stock adjustment');
  const items = await db.select().from(stockAdjustmentItems).where(eq(stockAdjustmentItems.adjustmentId, id)).orderBy(asc(stockAdjustmentItems.sortOrder));
  const info = await variantInfo(ctx, items.map((i) => i.variantId));
  return { ...doc, items: items.map((i) => ({ ...i, qtyAvailable: Number(i.qtyAvailable), qtyAdjusted: Number(i.qtyAdjusted), rate: Number(i.rate), value: Number(i.value), variant: info.get(i.variantId) })) };
}

async function remove(ctx: Ctx, id: string) {
  await db.transaction(async (tx) => {
    const [doc] = await tx.select({ id: stockAdjustments.id }).from(stockAdjustments).where(and(eq(stockAdjustments.tenantId, ctx.tenantId), eq(stockAdjustments.id, id)));
    if (!doc) throw notFound('Stock adjustment');
    await unpostStock(tx, SRC, id);
    await unpostJournal(tx, SRC, id);
    await tx.delete(stockAdjustments).where(eq(stockAdjustments.id, id));
  });
}

export async function adjustmentRoutes(app: FastifyInstance) {
  app.get('/inventory/adjustments', { preHandler: app.authorize('stock_adjustment.view') }, async (req) => listDocuments(stockAdjustments, req.ctx, listQuerySchema.parse(req.query)));
  app.get('/inventory/adjustments/:id', { preHandler: app.authorize('stock_adjustment.view') }, async (req) => get(req.ctx, idParam.parse(req.params).id));
  app.post('/inventory/adjustments', { preHandler: app.authorize('stock_adjustment.create') }, async (req, reply) => reply.code(201).send(await get(req.ctx, await create(req.ctx, stockAdjustmentSchema.parse(req.body)))));
  app.delete('/inventory/adjustments/:id', { preHandler: app.authorize('stock_adjustment.delete') }, async (req, reply) => { await remove(req.ctx, idParam.parse(req.params).id); return reply.code(204).send(); });
}
