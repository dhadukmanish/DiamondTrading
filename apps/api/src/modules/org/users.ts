import { and, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { ALL_PERMISSIONS, idParam, listQuerySchema, roleSchema, userSchema, type RoleInput, type UserInput } from '@erp/shared';
import { db } from '../../db/client';
import { rolePermissions, roles, userFirms, userRoles, users } from '../../db/schema/index';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { buildListQuery, countRows } from '../../lib/list-query';
import type { Ctx } from '../../lib/context';

// ---- users ----
const userCols = { name: users.name, email: users.email, isActive: users.isActive, createdAt: users.createdAt };

async function listUsers(ctx: Ctx, q: ReturnType<typeof listQuerySchema.parse>) {
  const { where, orderBy, limit, offset } = buildListQuery(users, q, { searchable: [users.name, users.email], columns: userCols, defaultSort: 'name' });
  const scope = and(eq(users.tenantId, ctx.tenantId), where);
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, isActive: users.isActive, defaultFirmId: users.defaultFirmId, createdAt: users.createdAt })
    .from(users).where(scope).orderBy(orderBy).limit(limit).offset(offset);
  const [cnt] = await db.select({ total: countRows.as('total') }).from(users).where(scope);
  const total = cnt?.total ?? 0;
  const ids = rows.map((r) => r.id);
  const rr = ids.length ? await db.select({ userId: userRoles.userId, roleId: roles.id, roleName: roles.name })
    .from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(inArray(userRoles.userId, ids)) : [];
  return {
    rows: rows.map((u) => ({ ...u, roles: rr.filter((x) => x.userId === u.id).map((x) => ({ id: x.roleId, name: x.roleName })) })),
    total, page: q.page, pageSize: q.pageSize,
  };
}

async function getUser(ctx: Ctx, id: string) {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, isActive: users.isActive, defaultFirmId: users.defaultFirmId })
    .from(users).where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, id)));
  if (!u) throw notFound('User');
  const [r, f] = await Promise.all([
    db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id)),
    db.select({ firmId: userFirms.firmId }).from(userFirms).where(eq(userFirms.userId, id)),
  ]);
  return { ...u, roleIds: r.map((x) => x.roleId), firmIds: f.map((x) => x.firmId) };
}

async function saveUser(ctx: Ctx, input: UserInput, id?: string) {
  if (!id && !input.password) throw badRequest('Password is required for a new user');
  return db.transaction(async (tx) => {
    const base = { name: input.name, email: input.email.toLowerCase(), phone: input.phone ?? null, defaultFirmId: input.defaultFirmId ?? null, isActive: input.isActive };
    const hash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
    let userId = id;
    if (id) {
      const [row] = await tx.update(users).set({ ...base, ...(hash ? { passwordHash: hash } : {}), updatedAt: new Date() })
        .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, id))).returning({ id: users.id });
      if (!row) throw notFound('User');
      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx.delete(userFirms).where(eq(userFirms.userId, id));
    } else {
      const [row] = await tx.insert(users).values({ ...base, tenantId: ctx.tenantId, passwordHash: hash! }).returning({ id: users.id });
      userId = row!.id;
    }
    if (input.roleIds.length) await tx.insert(userRoles).values(input.roleIds.map((roleId: string) => ({ userId: userId!, roleId })));
    if (input.firmIds.length) await tx.insert(userFirms).values(input.firmIds.map((firmId: string) => ({ userId: userId!, firmId })));
    return getUser(ctx, userId!);
  });
}

// ---- roles ----
async function listRoles(ctx: Ctx) {
  const rows = await db.select().from(roles).where(eq(roles.tenantId, ctx.tenantId)).orderBy(roles.name);
  const ids = rows.map((r) => r.id);
  const perms = ids.length ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, ids)) : [];
  return rows.map((r) => ({ ...r, permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission) }));
}

async function saveRole(ctx: Ctx, input: RoleInput, id?: string) {
  const invalid = input.permissions.filter((p: string) => p !== '*' && !ALL_PERMISSIONS.includes(p as never));
  if (invalid.length) throw badRequest(`Unknown permissions: ${invalid.join(', ')}`);
  return db.transaction(async (tx) => {
    let roleId = id;
    if (id) {
      const [row] = await tx.update(roles).set({ name: input.name, description: input.description ?? null, updatedAt: new Date() })
        .where(and(eq(roles.tenantId, ctx.tenantId), eq(roles.id, id), eq(roles.isSystem, false))).returning({ id: roles.id });
      if (!row) throw notFound('Role');
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    } else {
      const [row] = await tx.insert(roles).values({ tenantId: ctx.tenantId, name: input.name, description: input.description ?? null }).returning({ id: roles.id });
      roleId = row!.id;
    }
    if (input.permissions.length) await tx.insert(rolePermissions).values(input.permissions.map((permission: string) => ({ roleId: roleId!, permission })));
    return (await listRoles(ctx)).find((r) => r.id === roleId);
  });
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: app.authorize('users.view') }, async (req) => listUsers(req.ctx, listQuerySchema.parse(req.query)));
  app.get('/users/:id', { preHandler: app.authorize('users.view') }, async (req) => getUser(req.ctx, idParam.parse(req.params).id));
  app.post('/users', { preHandler: app.authorize('users.create') }, async (req, reply) => reply.code(201).send(await saveUser(req.ctx, userSchema.parse(req.body))));
  app.put('/users/:id', { preHandler: app.authorize('users.update') }, async (req) => saveUser(req.ctx, userSchema.parse(req.body), idParam.parse(req.params).id));
  app.delete('/users/:id', { preHandler: app.authorize('users.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (id === req.ctx.userId) throw conflict('You cannot delete yourself');
    await db.delete(users).where(and(eq(users.tenantId, req.ctx.tenantId), eq(users.id, id)));
    return reply.code(204).send();
  });

  app.get('/roles', { preHandler: app.authorize('roles.view') }, async (req) => listRoles(req.ctx));
  app.get('/roles/permissions', { preHandler: app.authorize('roles.view') }, async () => ALL_PERMISSIONS);
  app.post('/roles', { preHandler: app.authorize('roles.create') }, async (req, reply) => reply.code(201).send(await saveRole(req.ctx, roleSchema.parse(req.body))));
  app.put('/roles/:id', { preHandler: app.authorize('roles.update') }, async (req) => saveRole(req.ctx, roleSchema.parse(req.body), idParam.parse(req.params).id));
  app.delete('/roles/:id', { preHandler: app.authorize('roles.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.delete(roles).where(and(eq(roles.tenantId, req.ctx.tenantId), eq(roles.id, id), eq(roles.isSystem, false))).returning({ id: roles.id });
    if (!row) throw notFound('Role');
    return reply.code(204).send();
  });
}
