import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { DocType } from '@erp/shared';
import { db, type Tx } from '../../db/client';
import { documentSeries, firms } from '../../db/schema/index';
import { badRequest, notFound } from '../../lib/errors';
import type { Ctx } from '../../lib/context';

type Series = typeof documentSeries.$inferSelect;

/** "26/27" style financial-year label for a date, given the firm's FY start month. */
export function fyLabel(date: Date, fyStartMonth: number): string {
  const y = date.getFullYear();
  const start = date.getMonth() + 1 >= fyStartMonth ? y : y - 1;
  return `${String(start).slice(-2)}/${String(start + 1).slice(-2)}`;
}

export function formatNumber(s: Series, n: number, fy: string): string {
  const num = s.padding ? String(n).padStart(s.padding, '0') : String(n);
  return s.useFinancialYear ? `${s.prefix}${s.separator}${fy}${s.separator}${num}` : `${s.prefix}${s.separator}${num}`;
}

/** Series available for a doc type in a firm (firm-specific + tenant-wide). */
export async function seriesFor(ctx: Ctx, docType: DocType, firmId: string, branchId?: string | null) {
  return db.select().from(documentSeries).where(and(
    eq(documentSeries.tenantId, ctx.tenantId),
    eq(documentSeries.docType, docType),
    eq(documentSeries.isActive, true),
    or(eq(documentSeries.firmId, firmId), isNull(documentSeries.firmId)),
    branchId ? or(eq(documentSeries.branchId, branchId), isNull(documentSeries.branchId)) : isNull(documentSeries.branchId),
  )).orderBy(documentSeries.prefix);
}

/** Non-locking preview shown in the form: "POK-26/27-22". */
export async function preview(ctx: Ctx, seriesId: string, date = new Date()) {
  const [s] = await db.select().from(documentSeries).where(and(eq(documentSeries.tenantId, ctx.tenantId), eq(documentSeries.id, seriesId)));
  if (!s) throw notFound('Series');
  const fy = await fyFor(s, date);
  return { seriesId: s.id, number: s.nextNumber, docNo: formatNumber(s, s.nextNumber, fy), seriesType: s.seriesType };
}

/**
 * Allocates the next number inside the caller's transaction (row lock → no duplicates).
 * Regulated series ignore `requested` and always use the counter; unregulated may override.
 */
export async function allocate(tx: Tx, ctx: Ctx, seriesId: string, date: Date, requested?: number) {
  const [s] = await tx.select().from(documentSeries)
    .where(and(eq(documentSeries.tenantId, ctx.tenantId), eq(documentSeries.id, seriesId))).for('update');
  if (!s) throw notFound('Series');
  const n = s.seriesType === 'unregulated' && requested ? requested : s.nextNumber;
  if (s.seriesType === 'regulated' && requested && requested !== s.nextNumber) {
    throw badRequest(`Regulated series must use the next number (${s.nextNumber})`);
  }
  await tx.update(documentSeries).set({ nextNumber: sql`greatest(${documentSeries.nextNumber}, ${n} + 1)`, updatedAt: new Date() })
    .where(eq(documentSeries.id, s.id));
  const fy = await fyFor(s, date);
  return { seriesId: s.id, number: n, docNo: formatNumber(s, n, fy) };
}

async function fyFor(s: Series, date: Date) {
  if (!s.useFinancialYear) return '';
  let start = 4;
  if (s.firmId) {
    const [f] = await db.select({ m: firms.fyStartMonth }).from(firms).where(eq(firms.id, s.firmId));
    if (f) start = f.m;
  }
  return fyLabel(date, start);
}
