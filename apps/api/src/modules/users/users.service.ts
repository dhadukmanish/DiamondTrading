import {
  assignmentShapeForScope,
  type CreateUserInput,
  type ListUserQuery,
  type Paginated,
  type RoleAssignment,
  type RoleAssignmentInput,
  type SetUserAssignmentsInput,
  type UpdateUserInput,
  type User,
} from '@diamond/shared'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'

import { db, type DbExecutor } from '../../db/index'
import { branches, firms, roles, userRoles, type UserRow, users } from '../../db/schema/index'
import { recordAudit } from '../../lib/audit'
import type { ActorContext } from '../../lib/context'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { buildPaginationMeta, toOffset } from '../../lib/pagination'
import { hashPassword } from '../../lib/password'
import { containsPattern } from '../../lib/query'

function toUser(row: UserRow, assignments: RoleAssignment[]): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    status: row.status,
    isTenantOwner: row.isTenantOwner,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    assignments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function scopeFilter(tenantId: string): SQL {
  return and(eq(users.tenantId, tenantId), isNull(users.deletedAt)) as SQL
}

async function assignmentsByUser(
  executor: DbExecutor,
  userIds: readonly string[],
): Promise<Map<string, RoleAssignment[]>> {
  const byUser = new Map<string, RoleAssignment[]>()
  if (userIds.length === 0) return byUser

  const rows = await executor
    .select({
      id: userRoles.id,
      userId: userRoles.userId,
      roleId: roles.id,
      roleSlug: roles.slug,
      roleName: roles.name,
      scope: roles.scope,
      firmId: userRoles.firmId,
      branchId: userRoles.branchId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, [...userIds]))

  for (const row of rows) {
    const assignment: RoleAssignment = {
      id: row.id,
      roleId: row.roleId,
      roleSlug: row.roleSlug,
      roleName: row.roleName,
      scope: row.scope,
      firmId: row.firmId,
      branchId: row.branchId,
    }
    const list = byUser.get(row.userId)
    if (list) list.push(assignment)
    else byUser.set(row.userId, [assignment])
  }

  return byUser
}

export async function listUsers(
  tenantId: string,
  query: ListUserQuery,
): Promise<Paginated<User>> {
  const filters: SQL[] = [scopeFilter(tenantId)]

  if (query.userStatus) filters.push(eq(users.status, query.userStatus))
  if (query.search) {
    const pattern = containsPattern(query.search)
    filters.push(or(ilike(users.fullName, pattern), ilike(users.email, pattern)) as SQL)
  }

  // Filtering by firm or branch means "has an assignment there", which needs a
  // subquery rather than a column comparison.
  if (query.firmId || query.branchId) {
    const assignmentFilters: SQL[] = []
    if (query.firmId) assignmentFilters.push(eq(userRoles.firmId, query.firmId))
    if (query.branchId) assignmentFilters.push(eq(userRoles.branchId, query.branchId))

    const scoped = db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(...assignmentFilters))

    filters.push(inArray(users.id, scoped))
  }

  const where = and(...filters) as SQL
  const order = query.sortOrder === 'desc' ? desc(users.fullName) : asc(users.fullName)

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(users).where(where),
  ])

  const assignments = await assignmentsByUser(
    db,
    rows.map((row) => row.id),
  )

  return {
    data: rows.map((row) => toUser(row, assignments.get(row.id) ?? [])),
    meta: buildPaginationMeta(totals[0]?.value ?? 0, query),
  }
}

async function loadUser(executor: DbExecutor, tenantId: string, id: string): Promise<UserRow> {
  const rows = await executor
    .select()
    .from(users)
    .where(and(scopeFilter(tenantId), eq(users.id, id)))
    .limit(1)

  const row = rows[0]
  if (!row) throw notFound('User')
  return row
}

export async function getUser(tenantId: string, id: string): Promise<User> {
  const row = await loadUser(db, tenantId, id)
  const assignments = await assignmentsByUser(db, [row.id])
  return toUser(row, assignments.get(row.id) ?? [])
}

/**
 * Validates one assignment against the role it references: the scope decides
 * which of `firmId` / `branchId` must be present, and both must belong to this
 * tenant.
 */
interface ValidatedAssignment {
  roleId: string
  firmId: string | null
  branchId: string | null
}

async function validateAssignment(
  executor: DbExecutor,
  tenantId: string,
  input: RoleAssignmentInput,
): Promise<ValidatedAssignment> {
  const roleRows = await executor
    .select({ id: roles.id, slug: roles.slug, scope: roles.scope, tenantId: roles.tenantId })
    .from(roles)
    .where(
      and(
        eq(roles.id, input.roleId),
        or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)) as SQL,
      ),
    )
    .limit(1)

  const role = roleRows[0]
  if (!role) throw notFound('Role')

  if (role.scope === 'platform') {
    // Platform authority is granted out of band, never through tenant admin.
    throw forbidden('Platform roles cannot be assigned through this API')
  }

  const shape = assignmentShapeForScope(role.scope)
  const firmId = input.firmId ?? null
  const branchId = input.branchId ?? null

  if (shape.requiresFirm && !firmId) {
    throw badRequest(`Role ${role.slug} must be assigned to a firm`)
  }
  if (!shape.requiresFirm && firmId) {
    throw badRequest(`Role ${role.slug} applies to the whole tenant, so it takes no firm`)
  }
  if (shape.requiresBranch && !branchId) {
    throw badRequest(`Role ${role.slug} must be assigned to a branch`)
  }
  if (!shape.requiresBranch && branchId) {
    throw badRequest(`Role ${role.slug} takes no branch`)
  }

  if (firmId) {
    const firmRows = await executor
      .select({ id: firms.id })
      .from(firms)
      .where(and(eq(firms.id, firmId), eq(firms.tenantId, tenantId), isNull(firms.deletedAt)))
      .limit(1)
    if (!firmRows[0]) throw notFound('Firm')
  }

  if (branchId && firmId) {
    const branchRows = await executor
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(
          eq(branches.id, branchId),
          eq(branches.firmId, firmId),
          isNull(branches.deletedAt),
        ),
      )
      .limit(1)
    if (!branchRows[0]) throw notFound('Branch')
  }

  return { roleId: role.id, firmId, branchId }
}

async function replaceAssignments(
  executor: DbExecutor,
  tenantId: string,
  userId: string,
  inputs: readonly RoleAssignmentInput[],
): Promise<void> {
  const validated: ValidatedAssignment[] = []
  for (const input of inputs) {
    validated.push(await validateAssignment(executor, tenantId, input))
  }

  await executor.delete(userRoles).where(eq(userRoles.userId, userId))

  if (validated.length > 0) {
    await executor.insert(userRoles).values(
      validated.map((assignment) => ({
        userId,
        tenantId,
        roleId: assignment.roleId,
        firmId: assignment.firmId,
        branchId: assignment.branchId,
      })),
    )
  }
}

export async function createUser(context: ActorContext, input: CreateUserInput): Promise<User> {
  return db.transaction(async (tx) => {
    const clash = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, context.tenantId), eq(users.email, input.email)))
      .limit(1)

    if (clash[0]) throw conflict('A user with that email already exists')

    const inserted = await tx
      .insert(users)
      .values({
        tenantId: context.tenantId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        // Without a password the account stays `invited` and cannot sign in.
        passwordHash: input.password ? await hashPassword(input.password) : null,
        status: input.password ? 'active' : 'invited',
      })
      .returning()

    const row = inserted[0]
    if (!row) throw conflict('User could not be created')

    await replaceAssignments(tx, context.tenantId, row.id, input.assignments)

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'user.created',
      entityType: 'user',
      entityId: row.id,
      after: { email: row.email, fullName: row.fullName },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    const assignments = await assignmentsByUser(tx, [row.id])
    return toUser(row, assignments.get(row.id) ?? [])
  })
}

export async function updateUser(
  context: ActorContext,
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  return db.transaction(async (tx) => {
    const before = await loadUser(tx, context.tenantId, id)

    // The owner is the account that must always be able to get back in.
    if (before.isTenantOwner && input.status && input.status !== 'active') {
      throw forbidden('The tenant owner cannot be deactivated')
    }

    const updated = await tx
      .update(users)
      .set({
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(users.id, id))
      .returning()

    const row = updated[0]
    if (!row) throw notFound('User')

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      before: { fullName: before.fullName, status: before.status },
      after: { fullName: row.fullName, status: row.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    const assignments = await assignmentsByUser(tx, [id])
    return toUser(row, assignments.get(id) ?? [])
  })
}

export async function setUserAssignments(
  context: ActorContext,
  id: string,
  input: SetUserAssignmentsInput,
): Promise<User> {
  return db.transaction(async (tx) => {
    const row = await loadUser(tx, context.tenantId, id)

    if (row.isTenantOwner && input.assignments.length === 0) {
      throw forbidden('The tenant owner must keep at least one role')
    }

    await replaceAssignments(tx, context.tenantId, id, input.assignments)

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'user.roles_assigned',
      entityType: 'user',
      entityId: id,
      after: { assignments: input.assignments.length },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    const assignments = await assignmentsByUser(tx, [id])
    return toUser(row, assignments.get(id) ?? [])
  })
}

export async function deleteUser(context: ActorContext, id: string): Promise<void> {
  if (id === context.actorId) throw forbidden('You cannot delete your own account')

  await db.transaction(async (tx) => {
    const row = await loadUser(tx, context.tenantId, id)
    if (row.isTenantOwner) throw forbidden('The tenant owner cannot be deleted')

    await tx
      .update(users)
      .set({ deletedAt: new Date(), status: 'inactive' })
      .where(eq(users.id, id))

    // Drop the grants immediately: a soft-deleted account must not keep
    // authority if it is ever restored by hand.
    await tx.delete(userRoles).where(eq(userRoles.userId, id))

    await recordAudit(tx, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: 'user.deleted',
      entityType: 'user',
      entityId: id,
      before: { email: row.email },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
  })
}
