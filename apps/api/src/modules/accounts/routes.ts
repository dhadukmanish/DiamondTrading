import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { accountNature, accountSchema, accountSubTypes, accountTypes, idParam } from '@erp/shared';
import { db } from '../../db/client';
import { accounts, journalEntries, journalLines } from '../../db/schema';
import { sql } from 'drizzle-orm';
import { badRequest, conflict, notFound } from '../../lib/errors';

/** Chart of Accounts. Balance is 0 until the journal engine lands (next milestone) — the column is kept so the UI is final. */
export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', { preHandler: app.authorize('accounts.view') }, async (req) => {
    const q = z.object({ firmId: z.string().uuid().optional(), type: z.enum(accountTypes).optional(), search: z.string().optional(), postable: z.coerce.boolean().optional() }).parse(req.query);
    const rows = await db.select().from(accounts).where(and(
      eq(accounts.tenantId, req.ctx.tenantId),
      q.firmId ? or(eq(accounts.firmId, q.firmId), isNull(accounts.firmId)) : undefined,
      q.type ? eq(accounts.type, q.type) : undefined,
      q.postable ? eq(accounts.isGroup, false) : undefined,
    )).orderBy(asc(accounts.type), asc(accounts.name));
    const filtered = q.search ? rows.filter((r) => r.name.toLowerCase().includes(q.search!.toLowerCase())) : rows;
    const sums = await db.select({ accountId: journalLines.accountId, debit: sql<number>`coalesce(sum(${journalLines.debit}),0)::float`, credit: sql<number>`coalesce(sum(${journalLines.credit}),0)::float` })
      .from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalEntries.tenantId, req.ctx.tenantId), q.firmId ? eq(journalEntries.firmId, q.firmId) : undefined)).groupBy(journalLines.accountId);
    const bal = new Map(sums.map((s) => [s.accountId, s]));
    return filtered.map((r) => {
      const nature = accountNature(r.type as never);
      const s = bal.get(r.id);
      const balance = s ? (nature === 'debit' ? s.debit - s.credit : s.credit - s.debit) : 0;
      return { ...r, nature, balance: Math.round(balance * 100) / 100 };
    });
  });

  app.get('/accounts/sub-types', { preHandler: app.authenticate }, async () => accountSubTypes);

  app.get('/accounts/:id', { preHandler: app.authorize('accounts.view') }, async (req) => {
    const [r] = await db.select().from(accounts).where(and(eq(accounts.tenantId, req.ctx.tenantId), eq(accounts.id, idParam.parse(req.params).id)));
    if (!r) throw notFound('Account');
    return r;
  });

  app.post('/accounts', { preHandler: app.authorize('accounts.create') }, async (req, reply) => {
    const input = validate(accountSchema.parse(req.body));
    const [r] = await db.insert(accounts).values({ ...input, tenantId: req.ctx.tenantId, firmId: input.firmId ?? null, parentId: input.parentId ?? null, notes: input.notes ?? null }).returning();
    return reply.code(201).send(r);
  });

  app.put('/accounts/:id', { preHandler: app.authorize('accounts.update') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = validate(accountSchema.parse(req.body));
    const [existing] = await db.select().from(accounts).where(and(eq(accounts.tenantId, req.ctx.tenantId), eq(accounts.id, id)));
    if (!existing) throw notFound('Account');
    if (existing.isSystem) throw conflict('System accounts cannot be edited');
    if (input.parentId === id) throw badRequest('An account cannot be its own parent');
    const [r] = await db.update(accounts).set({ ...input, firmId: input.firmId ?? null, parentId: input.parentId ?? null, notes: input.notes ?? null, updatedAt: new Date() }).where(eq(accounts.id, id)).returning();
    return r;
  });

  app.delete('/accounts/:id', { preHandler: app.authorize('accounts.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [existing] = await db.select().from(accounts).where(and(eq(accounts.tenantId, req.ctx.tenantId), eq(accounts.id, id)));
    if (!existing) throw notFound('Account');
    if (existing.isSystem) throw conflict('System accounts cannot be deleted');
    const children = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.parentId, id)).limit(1);
    if (children.length) throw conflict('Remove child accounts first');
    await db.delete(accounts).where(eq(accounts.id, id));
    return reply.code(204).send();
  });

  void inArray;
}

function validate<T extends { type: string; subType: string }>(input: T): T {
  const allowed = accountSubTypes[input.type as keyof typeof accountSubTypes] ?? [];
  if (!allowed.includes(input.subType)) throw badRequest(`Sub type must be one of: ${allowed.join(', ')}`);
  return input;
}
