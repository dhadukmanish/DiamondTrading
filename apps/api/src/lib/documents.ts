import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ListQuery } from '@erp/shared';
import { db, type Tx } from '../db/client';
import { branches, firms, users } from '../db/schema';
import { countRows } from './list-query';
import { allocate } from '../modules/series/service';
import type { Ctx } from './context';

/** Allocates the document number inside the caller's tx and returns header columns to insert. */
export async function docHeader(tx: Tx, ctx: Ctx, h: { firmId: string; branchId: string; seriesId: string; number?: number; date: string; referenceNo?: string | null; notes?: string | null }) {
  const n = await allocate(tx, ctx, h.seriesId, new Date(h.date), h.number);
  return {
    tenantId: ctx.tenantId, firmId: h.firmId, branchId: h.branchId, seriesId: h.seriesId, number: n.number, docNo: n.docNo,
    date: h.date, referenceNo: h.referenceNo ?? null, notes: h.notes ?? null, createdBy: ctx.userId,
  };
}

type DocTable = PgTable & { tenantId: PgColumn; docNo: PgColumn; referenceNo: PgColumn; createdAt: PgColumn; firmId: PgColumn; branchId: PgColumn; createdBy: PgColumn; date: PgColumn; status: PgColumn };

/** Paged document list with firm / branch / creator names joined. */
export async function listDocuments<T extends DocTable>(table: T, ctx: Ctx, q: ListQuery, extraWhere?: SQL) {
  const where = and(
    eq(table.tenantId, ctx.tenantId),
    q.firmId ? eq(table.firmId, q.firmId) : undefined,
    q.search ? or(ilike(table.docNo, `%${q.search}%`), ilike(table.referenceNo, `%${q.search}%`)) : undefined,
    extraWhere,
  );
  const [rows, cnt] = await Promise.all([
    db.select({ doc: table, firmName: firms.name, branchName: branches.name, createdByName: users.name })
      .from(table).leftJoin(firms, eq(firms.id, table.firmId)).leftJoin(branches, eq(branches.id, table.branchId)).leftJoin(users, eq(users.id, table.createdBy))
      .where(where).orderBy(desc(table.date), desc(table.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    db.select({ total: countRows.as('total') }).from(table).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...(r.doc as T['$inferSelect']), firmName: r.firmName, branchName: r.branchName, createdByName: r.createdByName })), total: cnt[0]?.total ?? 0, page: q.page, pageSize: q.pageSize };
}
