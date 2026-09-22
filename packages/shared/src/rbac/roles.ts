import {
  grantedByManage,
  PERMISSION_CODES,
  type PermissionCode,
  type PermissionModule,
} from './permissions'

/**
 * The level of the hierarchy a role is assigned at. This determines which
 * columns an assignment row must carry:
 *
 *   platform -> firmId and branchId must both be null (cross-tenant staff)
 *   tenant   -> firmId and branchId must both be null (whole tenant)
 *   firm     -> firmId required, branchId null (one firm, all its branches)
 *   branch   -> firmId and branchId both required (a single branch)
 */
export const ROLE_SCOPES = ['platform', 'tenant', 'firm', 'branch'] as const

export type RoleScope = (typeof ROLE_SCOPES)[number]

export interface SystemRoleDefinition {
  readonly slug: string
  readonly name: string
  readonly scope: RoleScope
  readonly description: string
  readonly permissions: readonly PermissionCode[]
}

/**
 * Built-in roles. These are seeded with `tenant_id = NULL` and
 * `is_system = true`, are shared by every tenant, and cannot be edited or
 * deleted through the API. Tenants layer custom roles on top.
 */
export const SYSTEM_ROLES = [
  {
    slug: 'super_admin',
    name: 'Super Administrator',
    scope: 'platform',
    description: 'Platform operator with unrestricted access across all tenants.',
    permissions: PERMISSION_CODES,
  },
  {
    slug: 'tenant_owner',
    name: 'Tenant Owner',
    scope: 'tenant',
    description: 'Owns a single tenant: all firms, branches, users and roles within it.',
    permissions: [
      'tenant:read',
      'tenant:update',
      'firm:manage',
      'branch:manage',
      'user:manage',
      'role:manage',
      'audit:read',
      'settings:read',
      'settings:update',
    ],
  },
  {
    slug: 'firm_admin',
    name: 'Firm Administrator',
    scope: 'firm',
    description: 'Administers one firm and every branch under it.',
    permissions: [
      'firm:read',
      'firm:update',
      'branch:manage',
      'user:read',
      'user:create',
      'user:update',
      'role:read',
      'audit:read',
      'settings:read',
    ],
  },
  {
    slug: 'branch_manager',
    name: 'Branch Manager',
    scope: 'branch',
    description: 'Runs a single branch and the staff assigned to it.',
    permissions: ['firm:read', 'branch:read', 'branch:update', 'user:read', 'role:read'],
  },
  {
    slug: 'staff',
    name: 'Staff',
    scope: 'branch',
    description: 'Day-to-day operator with read access to their own branch.',
    permissions: ['firm:read', 'branch:read', 'user:read'],
  },
  {
    slug: 'auditor',
    name: 'Auditor',
    scope: 'tenant',
    description: 'Read-only access across the tenant, including the audit log.',
    permissions: [
      'tenant:read',
      'firm:read',
      'branch:read',
      'user:read',
      'role:read',
      'audit:read',
      'settings:read',
    ],
  },
] as const satisfies readonly SystemRoleDefinition[]

export type SystemRoleSlug = (typeof SYSTEM_ROLES)[number]['slug']

export const SYSTEM_ROLE_SLUGS = SYSTEM_ROLES.map((r) => r.slug) as readonly SystemRoleSlug[]

const SYSTEM_ROLE_SLUG_SET: ReadonlySet<string> = new Set<string>(SYSTEM_ROLE_SLUGS)

export function isSystemRoleSlug(value: string): value is SystemRoleSlug {
  return SYSTEM_ROLE_SLUG_SET.has(value)
}

export function getSystemRole(slug: SystemRoleSlug): SystemRoleDefinition {
  const role = SYSTEM_ROLES.find((r) => r.slug === slug)
  if (!role) {
    // Unreachable for a valid SystemRoleSlug; guards against a stale cast.
    throw new Error(`Unknown system role: ${slug}`)
  }
  return role
}

/**
 * Expands a role's stored grants into the flat set actually checked at request
 * time, resolving every `<module>:manage` grant into its concrete actions.
 */
export function expandPermissions(granted: readonly string[]): PermissionCode[] {
  const effective = new Set<string>()

  for (const code of granted) {
    effective.add(code)
    const [module, action] = code.split(':')
    if (action === 'manage' && module) {
      // An unrecognised module yields an empty expansion, so this is safe.
      for (const expanded of grantedByManage(module as PermissionModule)) {
        effective.add(expanded)
      }
    }
  }

  return [...effective].filter((code): code is PermissionCode =>
    (PERMISSION_CODES as readonly string[]).includes(code),
  )
}

/**
 * Whether an already-expanded permission set satisfies a required code. A
 * `<module>:manage` grant satisfies any action on that module.
 */
export function hasPermission(effective: readonly string[], required: string): boolean {
  if (effective.includes(required)) return true
  const [module] = required.split(':')
  return module ? effective.includes(`${module}:manage`) : false
}

/** True only if every required permission is satisfied. */
export function hasAllPermissions(
  effective: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((code) => hasPermission(effective, code))
}

/** True if at least one required permission is satisfied. */
export function hasAnyPermission(
  effective: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((code) => hasPermission(effective, code))
}

/**
 * Which assignment columns a role scope requires. Used by both the API
 * (validation) and the web app (form behaviour).
 */
export function assignmentShapeForScope(scope: RoleScope): {
  requiresFirm: boolean
  requiresBranch: boolean
} {
  switch (scope) {
    case 'platform':
    case 'tenant':
      return { requiresFirm: false, requiresBranch: false }
    case 'firm':
      return { requiresFirm: true, requiresBranch: false }
    case 'branch':
      return { requiresFirm: true, requiresBranch: true }
  }
}
