/**
 * Permission catalog.
 *
 * A permission code is always `<module>:<action>`. The catalog below is the
 * single source of truth: the API seeds the `permissions` table from it and the
 * web app uses it to drive navigation and control visibility.
 *
 * Phase 1 covers foundation modules only (the multi-tenant hierarchy and access
 * control). Domain modules get added here as later phases land.
 */

export const PERMISSION_MODULES = [
  'tenant',
  'firm',
  'branch',
  'user',
  'role',
  'audit',
  'settings',
] as const

export type PermissionModule = (typeof PERMISSION_MODULES)[number]

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'manage'] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export interface PermissionDefinition {
  readonly code: string
  readonly module: PermissionModule
  readonly action: PermissionAction
  readonly description: string
}

/**
 * `manage` is a superset of the other actions on the same module. It is stored
 * as its own row so a role can be granted a whole module without enumerating
 * every action, and it is expanded at authorization time.
 */
export const PERMISSIONS = [
  // Tenant - the subscribing organisation. Platform-level administration.
  { code: 'tenant:read', module: 'tenant', action: 'read', description: 'View tenant details' },
  { code: 'tenant:create', module: 'tenant', action: 'create', description: 'Create a tenant' },
  { code: 'tenant:update', module: 'tenant', action: 'update', description: 'Update tenant details' },
  { code: 'tenant:delete', module: 'tenant', action: 'delete', description: 'Delete a tenant' },
  { code: 'tenant:manage', module: 'tenant', action: 'manage', description: 'Full tenant control' },

  // Firm - a legal entity inside a tenant.
  { code: 'firm:read', module: 'firm', action: 'read', description: 'View firms' },
  { code: 'firm:create', module: 'firm', action: 'create', description: 'Create firms' },
  { code: 'firm:update', module: 'firm', action: 'update', description: 'Update firms' },
  { code: 'firm:delete', module: 'firm', action: 'delete', description: 'Delete firms' },
  { code: 'firm:manage', module: 'firm', action: 'manage', description: 'Full firm control' },

  // Branch - a physical location belonging to a firm.
  { code: 'branch:read', module: 'branch', action: 'read', description: 'View branches' },
  { code: 'branch:create', module: 'branch', action: 'create', description: 'Create branches' },
  { code: 'branch:update', module: 'branch', action: 'update', description: 'Update branches' },
  { code: 'branch:delete', module: 'branch', action: 'delete', description: 'Delete branches' },
  { code: 'branch:manage', module: 'branch', action: 'manage', description: 'Full branch control' },

  // Users and their scoped role assignments.
  { code: 'user:read', module: 'user', action: 'read', description: 'View users' },
  { code: 'user:create', module: 'user', action: 'create', description: 'Invite or create users' },
  { code: 'user:update', module: 'user', action: 'update', description: 'Update users' },
  { code: 'user:delete', module: 'user', action: 'delete', description: 'Deactivate or delete users' },
  { code: 'user:manage', module: 'user', action: 'manage', description: 'Full user control' },

  // Roles and permission grants.
  { code: 'role:read', module: 'role', action: 'read', description: 'View roles and permissions' },
  { code: 'role:create', module: 'role', action: 'create', description: 'Create custom roles' },
  { code: 'role:update', module: 'role', action: 'update', description: 'Update roles and grants' },
  { code: 'role:delete', module: 'role', action: 'delete', description: 'Delete custom roles' },
  { code: 'role:manage', module: 'role', action: 'manage', description: 'Full role control' },

  // Audit trail.
  { code: 'audit:read', module: 'audit', action: 'read', description: 'View the audit log' },

  // Tenant-level configuration.
  { code: 'settings:read', module: 'settings', action: 'read', description: 'View settings' },
  { code: 'settings:update', module: 'settings', action: 'update', description: 'Update settings' },
] as const satisfies readonly PermissionDefinition[]

export type PermissionCode = (typeof PERMISSIONS)[number]['code']

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code) as readonly PermissionCode[]

const PERMISSION_CODE_SET: ReadonlySet<string> = new Set<string>(PERMISSION_CODES)

export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODE_SET.has(value)
}

/** Every permission code defined for a single module. */
export function permissionsForModule(module: PermissionModule): readonly PermissionCode[] {
  return PERMISSIONS.filter((p) => p.module === module).map((p) => p.code) as PermissionCode[]
}

/** All codes except `manage` for a module - what a `manage` grant expands into. */
export function grantedByManage(module: PermissionModule): readonly PermissionCode[] {
  return PERMISSIONS.filter((p) => p.module === module && p.action !== 'manage').map(
    (p) => p.code,
  ) as PermissionCode[]
}
