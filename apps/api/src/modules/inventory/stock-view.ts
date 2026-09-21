import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { historyQuerySchema, stockQuerySchema } from '@erp/shared';
import { db } from '../../db/client';
import { branches, contacts, journalEntries, journalLines, accounts, productVariants, products, stockLots, stockMovements, units, salesOrderItems, salesOrders, purchaseOrderItems, purchaseOrders } from '../../db/schema';
import { sql } from 'drizzle-orm';
import { stockLevels } from '../../lib/ledger';

export async function stockViewRoutes(app: FastifyInstance) {
  /** Stock View: one row per variant with levels + prices; summary cards computed client-side from rows. */
  app.get('/inventory/stock', { preHandler: app.authorize('products.view') }, async (req) => {
    const q = stockQuerySchema.parse(req.query);
    const vars = await db.select({
      variantId: productVariants.id, productId: products.id, productName: products.name, variantName: productVariants.name, sku: productVariants.sku,
      unit: units.code, stockType: products.stockType, purchasePrice: productVariants.purchasePrice, sellingPrice: productVariants.sellingPrice, stockReminder: productVariants.stockReminder,
    }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).leftJoin(units, eq(units.id, products.unitId))
      .where(and(eq(products.tenantId, req.ctx.tenantId), eq(products.inventoryTracked, true), q.stockType && q.stockType !== 'all' ? eq(products.stockType, q.stockType) : undefined))
      .orderBy(asc(products.name), asc(productVariants.name));
    const levels = await stockLevels(db as never, req.ctx.tenantId, { firmId: q.firmId, branchId: q.branchId });
    const byVar = new Map(levels.map((l) => [l.variantId, l]));
    const soc = await db.select({ v: salesOrderItems.variantId, qty: sql<number>`sum(${salesOrderItems.qty} - ${salesOrderItems.invoicedQty} - ${salesOrderItems.returnedQty} - ${salesOrderItems.lossQty})::float`, pcs: sql<number>`sum(${salesOrderItems.pcs} - ${salesOrderItems.invoicedPcs} - ${salesOrderItems.returnedPcs} - ${salesOrderItems.lossPcs})::int` })
      .from(salesOrderItems).innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId)).where(and(eq(salesOrders.tenantId, req.ctx.tenantId), sql`${salesOrders.status} in ('open','partial')`, q.branchId ? eq(salesOrders.branchId, q.branchId) : undefined, q.firmId ? eq(salesOrders.firmId, q.firmId) : undefined)).groupBy(salesOrderItems.variantId);
    const poc = await db.select({ v: purchaseOrderItems.variantId, qty: sql<number>`sum(${purchaseOrderItems.qty} - ${purchaseOrderItems.billedQty})::float` })
      .from(purchaseOrderItems).innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.orderId)).where(and(eq(purchaseOrders.tenantId, req.ctx.tenantId), sql`${purchaseOrders.status} in ('open','partial')`, q.branchId ? eq(purchaseOrders.branchId, q.branchId) : undefined, q.firmId ? eq(purchaseOrders.firmId, q.firmId) : undefined)).groupBy(purchaseOrderItems.variantId);
    const soMap = new Map(soc.map((x) => [x.v, x])), poMap = new Map(poc.map((x) => [x.v, x]));
    return vars
      .map((v) => {
        const l = byVar.get(v.variantId);
        const qty = l?.qty ?? 0;
        return { ...v, purchasePrice: Number(v.purchasePrice), sellingPrice: Number(v.sellingPrice), stockReminder: Number(v.stockReminder),
          totalIn: l?.totalIn ?? 0, totalOut: l?.totalOut ?? 0, qty, pcs: l?.pcs ?? 0, soCommitted: soMap.get(v.variantId)?.qty ?? 0, soCommittedPcs: soMap.get(v.variantId)?.pcs ?? 0, poCommitted: poMap.get(v.variantId)?.qty ?? 0, saleableQty: qty - (soMap.get(v.variantId)?.qty ?? 0),
          value: l?.value ?? 0, avgRate: l?.avgRate ?? 0, lowStock: qty <= Number(v.stockReminder) && Number(v.stockReminder) > 0 };
      })
      .filter((r) => !q.hideZero || r.qty !== 0)
      .filter((r) => !q.search || `${r.productName} ${r.variantName} ${r.sku}`.toLowerCase().includes(q.search.toLowerCase()));
  });

  /** Branch-wise pivot: rows = variant, cols = branch qty. */
  app.get('/inventory/stock/by-branch', { preHandler: app.authorize('products.view') }, async (req) => {
    const q = z.object({ firmId: z.string().uuid().optional() }).parse(req.query);
    const br = await db.select({ id: branches.id, name: branches.name, firmId: branches.firmId }).from(branches).where(and(eq(branches.tenantId, req.ctx.tenantId), q.firmId ? eq(branches.firmId, q.firmId) : undefined)).orderBy(asc(branches.name));
    const perBranch = await Promise.all(br.map(async (b) => ({ branchId: b.id, levels: await stockLevels(db as never, req.ctx.tenantId, { branchId: b.id }) })));
    const varIds = [...new Set(perBranch.flatMap((p) => p.levels.map((l) => l.variantId)))];
    const names = varIds.length ? await db.select({ id: productVariants.id, productName: products.name, variantName: productVariants.name, sku: productVariants.sku })
      .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(eq(products.tenantId, req.ctx.tenantId)) : [];
    return {
      branches: br,
      rows: names.filter((n) => varIds.includes(n.id)).map((n) => ({
        ...n, byBranch: Object.fromEntries(perBranch.map((p) => [p.branchId, p.levels.find((l) => l.variantId === n.id)?.qty ?? 0])),
        total: perBranch.reduce((s, p) => s + (p.levels.find((l) => l.variantId === n.id)?.qty ?? 0), 0),
      })),
    };
  });

  /** Product History: every movement of a variant with running qty/pcs. */
  app.get('/inventory/history', { preHandler: app.authorize('products.view') }, async (req) => {
    const q = historyQuerySchema.parse(req.query);
    const rows = await db.select({ m: stockMovements, branchName: branches.name, contactName: contacts.displayName })
      .from(stockMovements).leftJoin(branches, eq(branches.id, stockMovements.branchId)).leftJoin(contacts, eq(contacts.id, stockMovements.contactId))
      .where(and(eq(stockMovements.tenantId, req.ctx.tenantId), eq(stockMovements.variantId, q.variantId),
        q.firmId ? eq(stockMovements.firmId, q.firmId) : undefined, q.branchId ? eq(stockMovements.branchId, q.branchId) : undefined,
        q.from ? gte(stockMovements.date, q.from) : undefined, q.to ? lte(stockMovements.date, q.to) : undefined))
      .orderBy(asc(stockMovements.date), asc(stockMovements.createdAt));
    let qty = 0, pcs = 0;
    return rows.map(({ m, branchName, contactName }) => {
      const sign = m.direction === 'in' ? 1 : -1;
      qty += sign * Number(m.qty); pcs += sign * m.pcs;
      return { id: m.id, date: m.date, branchName, contactName, docNo: m.docNo, sourceType: m.sourceType, sourceId: m.sourceId, direction: m.direction,
        qty: Number(m.qty), pcs: m.pcs, rate: Number(m.rate), value: Number(m.value), note: m.note, runningQty: Math.round(qty * 10000) / 10000, runningPcs: pcs };
    });
  });

  /** FIFO Tracking: open cost layers for a variant. */
  app.get('/inventory/lots', { preHandler: app.authorize('products.view') }, async (req) => {
    const q = z.object({ variantId: z.string().uuid(), branchId: z.string().uuid().optional() }).parse(req.query);
    const rows = await db.select({ l: stockLots, branchName: branches.name, docNo: stockMovements.docNo })
      .from(stockLots).leftJoin(branches, eq(branches.id, stockLots.branchId)).leftJoin(stockMovements, eq(stockMovements.id, stockLots.movementId))
      .where(and(eq(stockLots.tenantId, req.ctx.tenantId), eq(stockLots.variantId, q.variantId), q.branchId ? eq(stockLots.branchId, q.branchId) : undefined))
      .orderBy(asc(stockLots.receivedAt), asc(stockLots.createdAt));
    return rows.map(({ l, branchName, docNo }) => ({ id: l.id, receivedAt: l.receivedAt, branchName, docNo, qtyIn: Number(l.qtyIn), qtyRemaining: Number(l.qtyRemaining), pcsIn: l.pcsIn, pcsRemaining: l.pcsRemaining, rate: Number(l.rate), value: Number(l.qtyRemaining) * Number(l.rate) }));
  });

  /** Journal section for a document detail view. */
  app.get('/journal/by-source', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ sourceType: z.string(), sourceId: z.string().uuid() }).parse(req.query);
    const [entry] = await db.select().from(journalEntries).where(and(eq(journalEntries.tenantId, req.ctx.tenantId), eq(journalEntries.sourceType, q.sourceType), eq(journalEntries.sourceId, q.sourceId))).orderBy(desc(journalEntries.createdAt)).limit(1);
    if (!entry) return null;
    const lines = await db.select({ l: journalLines, accountName: accounts.name }).from(journalLines).innerJoin(accounts, eq(accounts.id, journalLines.accountId)).where(eq(journalLines.entryId, entry.id)).orderBy(asc(journalLines.sortOrder));
    return { ...entry, lines: lines.map(({ l, accountName }) => ({ id: l.id, accountName, debit: Number(l.debit), credit: Number(l.credit), narration: l.narration })) };
  });

  /** Account balances (Chart of Accounts column) — sum of lines, sign by nature. */
  app.get('/journal/balances', { preHandler: app.authorize('accounts.view') }, async (req) => {
    const q = z.object({ firmId: z.string().uuid().optional() }).parse(req.query);
    const { sql } = await import('drizzle-orm');
    const rows = await db.select({ accountId: journalLines.accountId, debit: sql<number>`coalesce(sum(${journalLines.debit}),0)::float`, credit: sql<number>`coalesce(sum(${journalLines.credit}),0)::float` })
      .from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalEntries.tenantId, req.ctx.tenantId), q.firmId ? eq(journalEntries.firmId, q.firmId) : undefined)).groupBy(journalLines.accountId);
    return Object.fromEntries(rows.map((r) => [r.accountId, { debit: r.debit, credit: r.credit }]));
  });
}
