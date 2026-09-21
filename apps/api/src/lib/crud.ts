import { and, eq } from 'drizzle-orm';
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core';
import type { Paged, ListQuery } from '@erp/shared';
import { db } from '../db/client';
import { notFound } from './errors';
import { buildListQuery, countRows } from './list-query';
import type { Ctx } from './context';

type AnyTable = PgTable<TableConfig> & { id: PgColumn; tenantId: PgColumn };

/**
 * Generic tenant-scoped CRUD for simple masters. Feature modules with rules
 * (users, series, custom fields) build on `db` directly instead.
 */
export function crudRepository<T extends AnyTable>(
  table: T,
  opts: { searchable: PgColumn[]; defaultSort?: string },
) {
  const columns = table as unknown as Record<string, PgColumn>;

  return {
    async list(ctx: Ctx, q: ListQuery): Promise<Paged<T['$inferSelect']>> {
      const { where, orderBy, limit, offset } = buildListQuery(table, q, { ...opts, columns });
      const scope = and(eq(table.tenantId, ctx.tenantId), where);
      const [rows, cnt] = await Promise.all([
        db.select().from(table as PgTable).where(scope).orderBy(orderBy).limit(limit).offset(offset),
        db.select({ total: countRows.as('total') }).from(table as PgTable).where(scope),
      ]);
      return { rows: rows as T['$inferSelect'][], total: cnt[0]?.total ?? 0, page: q.page, pageSize: q.pageSize };
    },

    async get(ctx: Ctx, id: string): Promise<T['$inferSelect']> {
      const [row] = await db.select().from(table as PgTable)
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id)));
      if (!row) throw notFound();
      return row as T['$inferSelect'];
    },

    async create(ctx: Ctx, data: Record<string, unknown>): Promise<T['$inferSelect']> {
      const rows = (await db.insert(table).values({ ...data, tenantId: ctx.tenantId } as never).returning()) as unknown as T['$inferSelect'][];
      return rows[0]!;
    },

    async update(ctx: Ctx, id: string, data: Record<string, unknown>): Promise<T['$inferSelect']> {
      const rows = (await db.update(table).set({ ...data, updatedAt: new Date() } as never)
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id))).returning()) as unknown as T['$inferSelect'][];
      if (!rows[0]) throw notFound();
      return rows[0];
    },

    async remove(ctx: Ctx, id: string): Promise<void> {
      const [row] = await db.delete(table)
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id))).returning({ id: table.id });
      if (!row) throw notFound();
    },
  };
}
export type CrudRepository = ReturnType<typeof crudRepository>;
