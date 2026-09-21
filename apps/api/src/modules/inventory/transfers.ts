import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { idParam, listQuerySchema, productTransferSchema, stockTransferSchema, type ProductTransferInput, type StockTransferInput } from '@erp/shared';
import { db } from '../../db/client';
import { branches, firms, productTransferItems, productTransfers, stockTransferItems, stockTransfers } from '../../db/schema';
import { docHeader, listDocuments } from '../../lib/documents';
import { notFound } from '../../lib/errors';
import { postJournal, stockIn, stockOut, unpostJournal, unpostStock } from '../../lib/ledger';
import type { Ctx } from '../../lib/context';
import { variantInfo } from './variants';

const ST = 'stock_transfer', PT = 'product_transfer';

/** Branch→branch (or firm→firm). OUT at FIFO cost from source, IN at that cost at destination. */
async function createStockTransfer(ctx: Ctx, input: StockTransferInput) {
  return db.transaction(async (tx) => {
    const header = await docHeader(tx, ctx, input);
    const [doc] = await tx.insert(stockTransfers).values({ ...header, toFirmId: input.toFirmId, toBranchId: input.toBranchId, status: 'approved' }).returning();
    let total = 0;
    for (const [i, it] of input.items.entries()) {
      const [line] = await tx.insert(stockTransferItems).values({ transferId: doc!.id, variantId: it.variantId, qty: String(it.qty), pcs: it.pcs, sortOrder: i }).returning({ id: stockTransferItems.id });
      const out = await stockOut(tx, ctx, { firmId: input.firmId, branchId: input.branchId, variantId: it.variantId, date: input.date, qty: it.qty, pcs: it.pcs, sourceType: ST, sourceId: doc!.id, sourceLineId: line!.id, docNo: doc!.docNo, note: 'Transfer out' });
      await stockIn(tx, ctx, { firmId: input.toFirmId, branchId: input.toBranchId, variantId: it.variantId, date: input.date, qty: it.qty, pcs: it.pcs, rate: out.rate, sourceType: ST, sourceId: doc!.id, sourceLineId: line!.id, docNo: doc!.docNo, note: 'Transfer in' });
      await tx.update(stockTransferItems).set({ unitPrice: String(out.rate), total: String(out.value) }).where(eq(stockTransferItems.id, line!.id));
      total += out.value;
    }
    await tx.update(stockTransfers).set({ totalValue: String(total) }).where(eq(stockTransfers.id, doc!.id));
    // Same Inventory Asset account both sides; entry recorded for the audit trail (inter-firm: from-firm credit, to-firm debit).
    await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: ST, sourceId: doc!.id, docNo: doc!.docNo, narration: input.notes,
      lines: [{ systemKey: 'inventory_asset', debit: total, narration: 'Transfer in' }, { systemKey: 'inventory_asset', credit: total, narration: 'Transfer out' }] });
    return doc!.id;
  });
}

/** Product→product conversion inside a branch. OUT at FIFO cost, IN to target at same cost. */
async function createProductTransfer(ctx: Ctx, input: ProductTransferInput) {
  return db.transaction(async (tx) => {
    const header = await docHeader(tx, ctx, input);
    const [doc] = await tx.insert(productTransfers).values({ ...header, status: 'approved' }).returning();
    let total = 0;
    for (const [i, it] of input.items.entries()) {
      const [line] = await tx.insert(productTransferItems).values({ transferId: doc!.id, fromVariantId: it.fromVariantId, toVariantId: it.toVariantId, qty: String(it.qty), pcs: it.pcs, sortOrder: i }).returning({ id: productTransferItems.id });
      const base = { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: PT, sourceId: doc!.id, sourceLineId: line!.id, docNo: doc!.docNo };
      const out = await stockOut(tx, ctx, { ...base, variantId: it.fromVariantId, qty: it.qty, pcs: it.pcs, note: 'Converted from' });
      await stockIn(tx, ctx, { ...base, variantId: it.toVariantId, qty: it.qty, pcs: it.pcs, rate: out.rate, note: 'Converted to' });
      await tx.update(productTransferItems).set({ unitPrice: String(out.rate), total: String(out.value) }).where(eq(productTransferItems.id, line!.id));
      total += out.value;
    }
    await tx.update(productTransfers).set({ totalValue: String(total) }).where(eq(productTransfers.id, doc!.id));
    await postJournal(tx, ctx, { firmId: input.firmId, branchId: input.branchId, date: input.date, sourceType: PT, sourceId: doc!.id, docNo: doc!.docNo, narration: input.notes,
      lines: [{ systemKey: 'inventory_asset', debit: total, narration: 'Converted to' }, { systemKey: 'inventory_asset', credit: total, narration: 'Converted from' }] });
    return doc!.id;
  });
}

async function getStockTransfer(ctx: Ctx, id: string) {
  const [doc] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.tenantId, ctx.tenantId), eq(stockTransfers.id, id)));
  if (!doc) throw notFound('Stock transfer');
  const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id)).orderBy(asc(stockTransferItems.sortOrder));
  const info = await variantInfo(ctx, items.map((i) => i.variantId));
  const [toFirm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, doc.toFirmId));
  const [toBranch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, doc.toBranchId));
  return { ...doc, toFirmName: toFirm?.name, toBranchName: toBranch?.name, items: items.map((i) => ({ ...i, qty: Number(i.qty), unitPrice: Number(i.unitPrice), total: Number(i.total), variant: info.get(i.variantId) })) };
}

async function getProductTransfer(ctx: Ctx, id: string) {
  const [doc] = await db.select().from(productTransfers).where(and(eq(productTransfers.tenantId, ctx.tenantId), eq(productTransfers.id, id)));
  if (!doc) throw notFound('Product transfer');
  const items = await db.select().from(productTransferItems).where(eq(productTransferItems.transferId, id)).orderBy(asc(productTransferItems.sortOrder));
  const info = await variantInfo(ctx, items.flatMap((i) => [i.fromVariantId, i.toVariantId]));
  return { ...doc, items: items.map((i) => ({ ...i, qty: Number(i.qty), unitPrice: Number(i.unitPrice), total: Number(i.total), fromVariant: info.get(i.fromVariantId), toVariant: info.get(i.toVariantId) })) };
}

/** Revert / delete: give stock back, drop the journal, remove the document. */
async function removeDoc(ctx: Ctx, table: typeof stockTransfers | typeof productTransfers, src: string, id: string) {
  await db.transaction(async (tx) => {
    const [doc] = await tx.select({ id: table.id }).from(table).where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id)));
    if (!doc) throw notFound('Transfer');
    await unpostStock(tx, src, id); await unpostJournal(tx, src, id);
    await tx.delete(table).where(eq(table.id, id));
  });
}

export async function transferRoutes(app: FastifyInstance) {
  app.get('/inventory/transfers', { preHandler: app.authorize('stock_transfer.view') }, async (req) => {
    const page = await listDocuments(stockTransfers, req.ctx, listQuerySchema.parse(req.query));
    const toIds = [...new Set(page.rows.flatMap((r) => [r.toFirmId, r.toBranchId]))];
    const [f, b] = await Promise.all([db.select({ id: firms.id, name: firms.name }).from(firms), db.select({ id: branches.id, name: branches.name }).from(branches)]);
    void toIds;
    return { ...page, rows: page.rows.map((r) => ({ ...r, toFirmName: f.find((x) => x.id === r.toFirmId)?.name, toBranchName: b.find((x) => x.id === r.toBranchId)?.name })) };
  });
  app.get('/inventory/transfers/:id', { preHandler: app.authorize('stock_transfer.view') }, async (req) => getStockTransfer(req.ctx, idParam.parse(req.params).id));
  app.post('/inventory/transfers', { preHandler: app.authorize('stock_transfer.create') }, async (req, reply) => reply.code(201).send(await getStockTransfer(req.ctx, await createStockTransfer(req.ctx, stockTransferSchema.parse(req.body)))));
  app.delete('/inventory/transfers/:id', { preHandler: app.authorize('stock_transfer.delete') }, async (req, reply) => { await removeDoc(req.ctx, stockTransfers, ST, idParam.parse(req.params).id); return reply.code(204).send(); });

  app.get('/inventory/product-transfers', { preHandler: app.authorize('product_transfer.view') }, async (req) => listDocuments(productTransfers, req.ctx, listQuerySchema.parse(req.query)));
  app.get('/inventory/product-transfers/:id', { preHandler: app.authorize('product_transfer.view') }, async (req) => getProductTransfer(req.ctx, idParam.parse(req.params).id));
  app.post('/inventory/product-transfers', { preHandler: app.authorize('product_transfer.create') }, async (req, reply) => reply.code(201).send(await getProductTransfer(req.ctx, await createProductTransfer(req.ctx, productTransferSchema.parse(req.body)))));
  app.delete('/inventory/product-transfers/:id', { preHandler: app.authorize('product_transfer.delete') }, async (req, reply) => { await removeDoc(req.ctx, productTransfers, PT, idParam.parse(req.params).id); return reply.code(204).send(); });
}
