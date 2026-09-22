import { type AuthUser, expandPermissions, type RoleScope } from '@diamond/shared'
import { and, eq, isNull } from 'drizzle-orm'

import type { DbExecutor } from '../../db/index'
import {
  permissions,
  rolePermissions,
  roles,
  tenants,
  userRoles,
  users,
} from '../../db/schema/index'

export interface LoadedIdentity {
  authUser: AuthUser
  /** Tenant lifecycle status, so callers can reject suspended tenants. */
  tenantStatus: string | null
}

/**
 * Builds the authenticated principal for a user id.
 *
 * Permissions are resolved from the database on every request rather than being
 * baked into the access token, so revoking a role or a grant takes effect
 * immediately instead of at the next token refresh.
 */
export async function loadIdentity(
  executor: DbExecutor,
  userId: string,
): Promise<LoadedIdentity | null> {
  const userRows = await executor
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      status: users.status,
      tenantId: users.tenantId,
      isTenantOwner: users.isTenantOwner,
      tenantSlug: tenants.slug,
      tenantStatus: tenants.status,
    })
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)

  const user = userRows[0]
  if (!user || user.status !== 'active') return null

  const assignmentRows = await executor
    .select({
      id: userRoles.id,
      roleId: roles.id,
      roleSlug: roles.slug,
      roleName: roles.name,
      scope: roles.scope,
      firmId: userRoles.firmId,
      branchId: userRoles.branchId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId))

  const permissionRows = await executor
    .selectDistinct({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId))

  // A platform-scoped assignment is what makes someone a super admin; it is
  // never inferred from a flag on the user row.
  const isSuperAdmin = assignmentRows.some((row) => row.scope === 'platform')

  const firmIds = [
    ...new Set(assignmentRows.map((row) => row.firmId).filter((id): id is string => id !== null)),
  ]
  const branchIds = [
    ...new Set(assignmentRows.map((row) => row.branchId).filter((id): id is string => id !== null)),
  ]

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug ?? null,
    isSuperAdmin,
    isTenantOwner: user.isTenantOwner,
    permissions: expandPermissions(permissionRows.map((row) => row.code)),
    assignments: assignmentRows.map((row) => ({
      id: row.id,
      roleId: row.roleId,
      roleSlug: row.roleSlug,
      roleName: row.roleName,
      scope: row.scope as RoleScope,
      firmId: row.firmId,
      branchId: row.branchId,
    })),
    firmIds,
    branchIds,
  }

  return { authUser, tenantStatus: user.tenantStatus ?? null }
}

/**
 * Whether a principal may act on a given firm.
 *
 * Tenant- and platform-scoped assignments carry no firm id and therefore cover
 * every firm in scope; only firm/branch-scoped users are restricted to the
 * firms they are explicitly assigned to.
 */
export function hasTenantWideAccess(authUser: AuthUser): boolean {
  return (
    authUser.isSuperAdmin ||
    authUser.assignments.some((assignment) => assignment.scope === 'tenant')
  )
}

export function canAccessFirm(authUser: AuthUser, firmId: string): boolean {
  if (hasTenantWideAccess(authUser)) return true
  return authUser.firmIds.includes(firmId)
}

export function canAccessBranch(authUser: AuthUser, branchId: string, firmId: string): boolean {
  if (hasTenantWideAccess(authUser)) return true
  // A firm-scoped assignment (firmId set, no branchId) covers every branch in
  // that firm.
  const firmWide = authUser.assignments.some(
    (assignment) => assignment.firmId === firmId && assignment.branchId === null,
  )
  return firmWide || authUser.branchIds.includes(branchId)
}
