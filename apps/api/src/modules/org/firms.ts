import { and, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { branchSchema, firmSchema, idParam, listQuerySchema } from '@erp/shared';
import { db } from '../../db/client';
import { branches, firms, userFirms } from '../../db/schema/index';
import { crudRepository } from '../../lib/crud';
import { registerCrudRoutes } from '../../lib/crud-routes';
import type { Ctx } from '../../lib/context';

const firmRepo = crudRepository(firms, { searchable: [firms.name, firms.gstin], defaultSort: 'name' });
const branchRepo = crudRepository(branches, { searchable: [branches.name, branches.code], defaultSort: 'name' });

/** Only one default firm per tenant; only one default branch per firm. */
async function clearOtherDefaults(ctx: Ctx, table: 'firm' | 'branch', keepId: string, firmId?: string) {
  if (table === 'firm') {
    await db.update(firms).set({ isDefault: false }).where(and(eq(firms.tenantId, ctx.tenantId), ne(firms.id, keepId)));
  } else if (firmId) {
    await db.update(branches).set({ isDefault: false }).where(and(eq(branches.firmId, firmId), ne(branches.id, keepId)));
  }
}

/** Firms visible to the current user (no user_firms rows = all). */
export async function accessibleFirms(ctx: Ctx) {
  const allowed = await db.select({ firmId: userFirms.firmId }).from(userFirms).where(eq(userFirms.userId, ctx.userId));
  const scope = and(eq(firms.tenantId, ctx.tenantId), eq(firms.isActive, true));
  if (!allowed.length) return db.select().from(firms).where(scope).orderBy(firms.name);
  return db.select().from(firms).where(and(scope, inArray(firms.id, allowed.map((a) => a.firmId)))).orderBy(firms.name);
}

export async function orgRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, { prefix: '/firms', module: 'firms', schema: firmSchema, repo: firmRepo });
  registerCrudRoutes(app, { prefix: '/branches', module: 'branches', schema: branchSchema, repo: branchRepo });

  // Firm switcher: firms the user may work in, each with its branches.
  app.get('/my/firms', { preHandler: app.authenticate }, async (req) => {
    const list = await accessibleFirms(req.ctx);
    if (!list.length) return [];
    const br = await db.select().from(branches)
      .where(and(inArray(branches.firmId, list.map((f) => f.id)), eq(branches.isActive, true))).orderBy(branches.name);
    return list.map((f) => ({ ...f, branches: br.filter((b) => b.firmId === f.id) }));
  });

  // keep single-default invariants after create/update
  app.addHook('onSend', async (req, _reply, payload) => {
    if (!['POST', 'PUT'].includes(req.method)) return payload;
    const url = req.routeOptions.url ?? '';
    if (url.startsWith('/firms') || url.startsWith('/branches')) {
      const body = safeJson(payload);
      if (body?.isDefault && body.id) {
        await clearOtherDefaults(req.ctx, url.startsWith('/firms') ? 'firm' : 'branch', body.id, body.firmId);
      }
    }
    return payload;
  });

  app.get('/firms/:id/branches', { preHandler: app.authorize('branches.view') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = listQuerySchema.parse(req.query);
    return branchRepo.list(req.ctx, { ...q, filters: JSON.stringify([{ field: 'firmId', op: 'eq', value: id }]) });
  });
}

function safeJson(p: unknown): { id?: string; isDefault?: boolean; firmId?: string } | null {
  if (typeof p !== 'string') return null;
  try { return JSON.parse(p); } catch { return null; }
}
