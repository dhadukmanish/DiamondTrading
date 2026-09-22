import type {
  CreateRoleInput,
  ListQuery,
  Paginated,
  Permission,
  Role,
  UpdateRoleInput,
} from '@diamond/shared'
import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'

import { db, type DbExecutor } from '../../db/index'
import { permissions, rolePermissions, type RoleRow, roles, userRoles } from '../../db/schema/index'
import { recordAudit } from '../../lib/audit'
import type { ActorContext } from '../../lib/context'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { buildPaginationMeta, toOffset } from '../../lib/pagination'
import { containsPattern } from '../../lib/query'

function toRole(row: RoleRow, granted: readonly string[]): Role {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    scope: row.scope,
    description: row.description,
    isSystem: row.isSystem,
    permissions: [...granted],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * A tenant sees its own roles plus the built-in ones, which are stored once
 * with `tenant_id = NULL` and shared by everybody.
 */
function visibleToTenant(tenantId: string): SQL {
  return or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)) as SQL
}

async function grantsByRole(
  executor: DbExecutor,
  roleIds: readonly string[],
): Promise<Map<string, string[]>> {
  const grants = new Map<string, string[]>()
  if (roleIds.length === 0) return grants

  const rows = await executor
    .select({ roleId: rolePermissions.roleId, code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(rolePermissions.roleId, [...roleIds]))

  for (const row of rows) {
    const list = grants.get(row.roleId)
    if (list) list.push(row.code)
    else grants.set(row.roleId, [row.code])
  }

  return grants
}

export async function listPermissions(): Promise<Permission[]> {
  const rows = await db.select().from(permissions).orderBy(asc(permissions.code))

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    module: row.module,
    action: row.action,
    description: row.description,
  }))
}

export async function listRoles(tenantId: string, query: ListQuery): Promise<Paginated<Role>> {
  const filters: SQL[] = [visibleToTenant(tenantId)]

  if (query.search) {
    const pattern = containsPattern(query.search)
    filters.push(or(ilike(roles.name, pattern), ilike(roles.slug, pattern)) as SQL)
  }

  const where = and(...filters) as SQL

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(roles)
      .where(where)
      .orderBy(asc(roles.name))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(roles).where(where),
  ])

  const grants = await grantsByRole(
    db,
    rows.map((row) => row.id),
  )

  return {
    data: rows.map((row) => toRole(row, grants.get(row.id) ?? [])),
    meta: buildPaginationMeta(totals[0]?.value ?? 0, query),
  }
}

async function loadRole(executor: DbExecutor, tenantId: string, id: string): Promise<RoleRow> {
  const rows = await executor
    .select()
    .from(roles)
    .where(and(visibleToTenant(tenantId), eq(roles.id, id)))
    .limit(1)

  const row = rows[0]
  if (!row) throw notFound('Role')
  return row
}

export async function getRole(tenantId: string, id: string): Promise<Role> {
  const row = await loadRole(db, tenantId, id)
  const grants = await grantsByRole(db, [row.id])
  return toRole(row, grants.get(row.id) ?? [])
}

/**
 * Resolves permission codes to catalog ids, rejecting anything unknown. The
 * wire schema only checks the `module:action` shape, so this is where a typo or
 * a stale client is actually caught.
 */
async function resolvePermissionIds(
  executor: DbExecutor,
  codes: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(codes)]
  if (unique.length === 0) return []

  const rows = await executor
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, unique))

  if (rows.length !== unique.length) {
    const known = new Set(rows.map((row) => row.code))
    const unknown = unique.filter((code) => !known.has(code))
    throw badRequest(
      'Unknown permission code',
      unknown.map((code) => ({ path: 'permissions', message: code })),
    )
  }

  return rows.map((row) => row.id)
}

async function replaceGrants(
  executor: DbExecutor,
  roleId: string,
  codes: readonly string[],
): Promise<void> {
  const permissionIds = await resolvePermissionIds(executor, codes)

  await executor.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))

  if (permissionIds.length > 0) {
    await executor
      .insert(rolePermissions)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
  }
}

/** Built-in roles are shared by every tenant and are therefore never editable. */
function assertEditable(row: RoleRow): void {
  if (row.isSystem || row.tenantId === null) {
    throw forbidden('Built-in roles cannot be modified')
  }
}

export async function createRole(context: ActorContext, input: CreateRoleInput): Promise<Role> {
  return db.transaction(async (tx) => {
    const clash = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(visibleToTenant(context.tenantId), eq(roles.slug, input.slug)))
      .limit(1)

    if (clash[0]) throw conflict(`A role with slug ${input.slug} already exists`)

    // A tenant cannot mint platform-wide authority for itself.
    if (input.scope === 'platform') {
      throw forbidden('Platform-scoped roles are built in and cannot be created')
    }

    const inserted = await tx
      .insert(roles)
      .values({
        tenantId: context.tenantId,
        name: input.name,
        slug: input.slug,
        scope: input.scope,
        description: input.description ?? null,
        isSystem: false,
      })
      .returning()

    const row = inserted[0]
    if (!row) throw conflict('Role could not be created')

    await replaceGrants(tx, row.id, input.permissions)

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'role.created',
      entityType: 'role',
      entityId: row.id,
      after: { slug: row.slug, permissions: [...input.permissions] },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    return toRole(row, input.permissions)
  })
}

export async function updateRole(
  context: ActorContext,
  id: string,
  input: UpdateRoleInput,
): Promise<Role> {
  return db.transaction(async (tx) => {
    const before = await loadRole(tx, context.tenantId, id)
    assertEditable(before)

    const updated = await tx
      .update(roles)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      })
      .where(eq(roles.id, id))
      .returning()

    const row = updated[0]
    if (!row) throw notFound('Role')

    if (input.permissions) {
      await replaceGrants(tx, id, input.permissions)
    }

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'role.updated',
      entityType: 'role',
      entityId: id,
      before: { name: before.name },
      after: { name: row.name, ...(input.permissions ? { permissions: input.permissions } : {}) },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    const grants = await grantsByRole(tx, [id])
    return toRole(row, grants.get(id) ?? [])
  })
}

export async function setRolePermissions(
  context: ActorContext,
  id: string,
  codes: readonly string[],
): Promise<Role> {
  return updateRole(context, id, { permissions: [...codes] })
}

export async function deleteRole(context: ActorContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await loadRole(tx, context.tenantId, id)
    assertEditable(row)

    const assigned = await tx
      .select({ value: count() })
      .from(userRoles)
      .where(eq(userRoles.roleId, id))

    if ((assigned[0]?.value ?? 0) > 0) {
      throw conflict('This role is still assigned to one or more users')
    }

    await tx.delete(roles).where(eq(roles.id, id))

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      before: { slug: row.slug, name: row.name },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
  })
}
