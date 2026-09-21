import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { stockLotConsumptions, stockLots, stockMovements } from '../../db/schema';
import { conflict } from '../errors';
import type { Ctx } from '../context';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

interface MoveBase {
  firmId: string; branchId: string; variantId: string; date: string;
  sourceType: string; sourceId: string; sourceLineId?: string | null; contactId?: string | null; docNo?: string; note?: string;
}

/** Stock IN: records the movement and opens a FIFO lot at `rate`. */
export async function stockIn(tx: Tx, ctx: Ctx, m: MoveBase & { qty: number; pcs?: number; rate: number }) {
  const value = r4(m.qty * m.rate);
  const [mv] = await tx.insert(stockMovements).values({
    tenantId: ctx.tenantId, firmId: m.firmId, branchId: m.branchId, variantId: m.variantId, date: m.date, direction: 'in',
    qty: String(m.qty), pcs: m.pcs ?? 0, rate: String(m.rate), value: String(value),
    sourceType: m.sourceType, sourceId: m.sourceId, sourceLineId: m.sourceLineId ?? null, contactId: m.contactId ?? null, docNo: m.docNo ?? null, note: m.note ?? null,
  }).returning({ id: stockMovements.id });
  await tx.insert(stockLots).values({
    tenantId: ctx.tenantId, firmId: m.firmId, branchId: m.branchId, variantId: m.variantId, movementId: mv!.id, receivedAt: m.date,
    qtyIn: String(m.qty), qtyRemaining: String(m.qty), pcsIn: m.pcs ?? 0, pcsRemaining: m.pcs ?? 0, rate: String(m.rate),
  });
  return { movementId: mv!.id, value, rate: m.rate };
}

/**
 * Stock OUT at FIFO cost. Consumes oldest lots first; if stock is insufficient the
 * remainder is costed at the last lot rate (negative stock allowed, shown red in UI).
 * Returns the cost value so the caller can post COGS / inventory credit.
 */
export async function stockOut(tx: Tx, ctx: Ctx, m: MoveBase & { qty: number; pcs?: number }) {
  const lots = await tx.select().from(stockLots)
    .where(and(eq(stockLots.variantId, m.variantId), eq(stockLots.branchId, m.branchId), gt(stockLots.qtyRemaining, '0')))
    .orderBy(asc(stockLots.receivedAt), asc(stockLots.createdAt)).for('update');

  let remaining = m.qty, pcsLeft = m.pcs ?? 0, value = 0, lastRate = 0;
  const consumptions: { lotId: string; qty: number; pcs: number; rate: number }[] = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const avail = Number(lot.qtyRemaining);
    const take = Math.min(avail, remaining);
    const takePcs = Math.min(lot.pcsRemaining, pcsLeft);
    const rate = Number(lot.rate);
    consumptions.push({ lotId: lot.id, qty: take, pcs: takePcs, rate });
    value += take * rate; remaining = r4(remaining - take); pcsLeft -= takePcs; lastRate = rate;
    await tx.update(stockLots).set({ qtyRemaining: String(r4(avail - take)), pcsRemaining: lot.pcsRemaining - takePcs, updatedAt: new Date() }).where(eq(stockLots.id, lot.id));
  }
  if (remaining > 0) {
    if (!lastRate) lastRate = await lastKnownRate(tx, m.variantId, m.branchId);
    value += remaining * lastRate;   // negative stock: cost at last known rate
  }
  value = r4(value);
  const rate = m.qty ? r4(value / m.qty) : 0;

  const [mv] = await tx.insert(stockMovements).values({
    tenantId: ctx.tenantId, firmId: m.firmId, branchId: m.branchId, variantId: m.variantId, date: m.date, direction: 'out',
    qty: String(m.qty), pcs: m.pcs ?? 0, rate: String(rate), value: String(value),
    sourceType: m.sourceType, sourceId: m.sourceId, sourceLineId: m.sourceLineId ?? null, contactId: m.contactId ?? null, docNo: m.docNo ?? null, note: m.note ?? null,
  }).returning({ id: stockMovements.id });
  if (consumptions.length) {
    await tx.insert(stockLotConsumptions).values(consumptions.map((c) => ({ movementId: mv!.id, lotId: c.lotId, qty: String(c.qty), pcs: c.pcs, rate: String(c.rate) })));
  }
  return { movementId: mv!.id, value, rate };
}

/**
 * Undo every movement a document made (document delete). IN lots must be unconsumed;
 * OUT consumptions are handed back to their lots.
 */
export async function unpostStock(tx: Tx, sourceType: string, sourceId: string) {
  const moves = await tx.select().from(stockMovements).where(and(eq(stockMovements.sourceType, sourceType), eq(stockMovements.sourceId, sourceId)));
  if (!moves.length) return;
  const ids = moves.map((m) => m.id);

  const lots = await tx.select().from(stockLots).where(inArray(stockLots.movementId, ids));
  for (const lot of lots) {
    if (Number(lot.qtyRemaining) !== Number(lot.qtyIn)) throw conflict('Stock from this document has already been used by later transactions');
  }
  const cons = await tx.select().from(stockLotConsumptions).where(inArray(stockLotConsumptions.movementId, ids));
  for (const c of cons) {
    await tx.update(stockLots).set({
      qtyRemaining: sql`${stockLots.qtyRemaining} + ${c.qty}`, pcsRemaining: sql`${stockLots.pcsRemaining} + ${c.pcs}`, updatedAt: new Date(),
    }).where(eq(stockLots.id, c.lotId));
  }
  await tx.delete(stockMovements).where(inArray(stockMovements.id, ids));   // cascades lots + consumptions
}

async function lastKnownRate(tx: Tx, variantId: string, branchId: string) {
  const [m] = await tx.select({ rate: stockMovements.rate }).from(stockMovements)
    .where(and(eq(stockMovements.variantId, variantId), eq(stockMovements.branchId, branchId), eq(stockMovements.direction, 'in')))
    .orderBy(sql`${stockMovements.date} desc, ${stockMovements.createdAt} desc`).limit(1);
  return m ? Number(m.rate) : 0;
}

/** Current qty/pcs per variant (optionally per branch) from movements — used by forms and Stock View. */
export async function stockLevels(tx: Tx, tenantId: string, opts: { firmId?: string; branchId?: string; variantIds?: string[] }) {
  const rows = await tx.select({
    variantId: stockMovements.variantId,
    totalIn: sql<number>`coalesce(sum(case when ${stockMovements.direction}='in' then ${stockMovements.qty} end),0)::float`,
    totalOut: sql<number>`coalesce(sum(case when ${stockMovements.direction}='out' then ${stockMovements.qty} end),0)::float`,
    pcs: sql<number>`coalesce(sum(case when ${stockMovements.direction}='in' then ${stockMovements.pcs} else -${stockMovements.pcs} end),0)::int`,
  }).from(stockMovements).where(and(
    eq(stockMovements.tenantId, tenantId),
    opts.firmId ? eq(stockMovements.firmId, opts.firmId) : undefined,
    opts.branchId ? eq(stockMovements.branchId, opts.branchId) : undefined,
    opts.variantIds?.length ? inArray(stockMovements.variantId, opts.variantIds) : undefined,
  )).groupBy(stockMovements.variantId);

  const lotVals = await tx.select({
    variantId: stockLots.variantId,
    value: sql<number>`coalesce(sum(${stockLots.qtyRemaining} * ${stockLots.rate}),0)::float`,
    qty: sql<number>`coalesce(sum(${stockLots.qtyRemaining}),0)::float`,
  }).from(stockLots).where(and(
    eq(stockLots.tenantId, tenantId),
    opts.firmId ? eq(stockLots.firmId, opts.firmId) : undefined,
    opts.branchId ? eq(stockLots.branchId, opts.branchId) : undefined,
    opts.variantIds?.length ? inArray(stockLots.variantId, opts.variantIds) : undefined,
  )).groupBy(stockLots.variantId);

  const byVar = new Map(lotVals.map((l) => [l.variantId, l]));
  return rows.map((r) => {
    const lot = byVar.get(r.variantId);
    const qty = r4(r.totalIn - r.totalOut);
    const value = r4(lot?.value ?? 0);
    return { variantId: r.variantId, totalIn: r.totalIn, totalOut: r.totalOut, qty, pcs: r.pcs, value, avgRate: lot?.qty ? r4(value / lot.qty) : 0 };
  });
}
