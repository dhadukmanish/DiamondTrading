import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { filterSchema, type Filter, type ListQuery } from '@erp/shared';
import { badRequest } from './errors';

type Cols = Record<string, PgColumn>;

/**
 * Turns the shared ListQuery (?search&sort&filters) into drizzle where/orderBy.
 * `searchable` = columns hit by free-text search; `sortable`/`filterable` whitelist columns.
 */
export function buildListQuery<T extends PgTable>(
  table: T,
  q: ListQuery,
  opts: { searchable: PgColumn[]; columns: Cols; defaultSort?: string },
) {
  const where: SQL[] = [];

  if (q.search && opts.searchable.length) {
    const term = `%${q.search}%`;
    where.push(or(...opts.searchable.map((c) => ilike(c, term)))!);
  }

  if (q.filters) {
    let parsed: Filter[];
    try { parsed = filterSchema.array().parse(JSON.parse(q.filters)); }
    catch { throw badRequest('Invalid filters'); }
    for (const f of parsed) {
      const col = opts.columns[f.field];
      if (!col) throw badRequest(`Cannot filter by ${f.field}`);
      where.push(filterToSql(col, f));
    }
  }

  const sortKey = q.sort ?? opts.defaultSort ?? '-createdAt';
  const dir = sortKey.startsWith('-') ? desc : asc;
  const sortCol = opts.columns[sortKey.replace(/^-/, '')];
  if (!sortCol) throw badRequest(`Cannot sort by ${sortKey}`);

  return {
    where: where.length ? and(...where) : undefined,
    orderBy: dir(sortCol),
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  };
}

function filterToSql(col: PgColumn, f: Filter): SQL {
  const v = f.value as never;
  switch (f.op) {
    case 'eq': return eq(col, v);
    case 'ne': return ne(col, v);
    case 'contains': return ilike(col, `%${String(v)}%`);
    case 'starts': return ilike(col, `${String(v)}%`);
    case 'gt': return gt(col, v);
    case 'gte': return gte(col, v);
    case 'lt': return lt(col, v);
    case 'lte': return lte(col, v);
    case 'in': return inArray(col, Array.isArray(v) ? v : [v]);
    case 'between': {
      const [a, b] = v as [unknown, unknown];
      return and(gte(col, a as never), lte(col, b as never))!;
    }
    case 'isnull': return isNull(col);
    case 'notnull': return isNotNull(col);
  }
}

export const countRows = sql<number>`count(*)::int`;

