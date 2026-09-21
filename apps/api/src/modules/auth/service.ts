import { and, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { AuthUser, LoginInput } from '@erp/shared';
import { db } from '../../db/client';
import { rolePermissions, roles, userRoles, users } from '../../db/schema/index';
import { unauthorized } from '../../lib/errors';

export async function buildAuthUser(userId: string): Promise<AuthUser | null> {
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.isActive, true)));
  if (!u) return null;

  const roleRows = await db.select({ id: roles.id, name: roles.name })
    .from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, u.id));
  const roleIds = roleRows.map((r) => r.id);
  const perms = roleIds.length
    ? await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
    : [];

  return {
    id: u.id, tenantId: u.tenantId, name: u.name, email: u.email,
    roles: roleRows.map((r) => r.name),
    permissions: [...new Set(perms.map((p) => p.p))],
    defaultFirmId: u.defaultFirmId,
  };
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const [u] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
  if (!u || !u.isActive || !(await bcrypt.compare(input.password, u.passwordHash))) {
    throw unauthorized('Email or password is incorrect');
  }
  return (await buildAuthUser(u.id))!;
}
