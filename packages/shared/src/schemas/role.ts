import { z } from 'zod'

import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '../rbac/permissions'
import { ROLE_SCOPES } from '../rbac/roles'
import { slugSchema, timestampsSchema, uuidSchema } from './common'

export const roleScopeSchema = z.enum(ROLE_SCOPES)

export const permissionModuleSchema = z.enum(PERMISSION_MODULES)
export const permissionActionSchema = z.enum(PERMISSION_ACTIONS)

/**
 * Validated loosely as `<module>:<action>` rather than against the literal
 * union, so a newer client cannot be rejected outright by an older server. The
 * API still refuses codes that are absent from the catalog table.
 */
export const permissionCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z_]+:[a-z_]+$/, 'Permission codes look like "module:action"')

export const permissionSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  module: permissionModuleSchema,
  action: permissionActionSchema,
  description: z.string(),
})
export type Permission = z.infer<typeof permissionSchema>

export const roleSchema = z
  .object({
    id: uuidSchema,
    /** Null for built-in roles, which are shared across all tenants. */
    tenantId: uuidSchema.nullable(),
    name: z.string(),
    slug: z.string(),
    scope: roleScopeSchema,
    description: z.string().nullable(),
    isSystem: z.boolean(),
    permissions: z.array(z.string()),
  })
  .merge(timestampsSchema)
export type Role = z.infer<typeof roleSchema>

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  scope: roleScopeSchema,
  description: z.string().trim().max(500).optional(),
  permissions: z.array(permissionCodeSchema).default([]),
})
export type CreateRoleInput = z.infer<typeof createRoleSchema>

export const updateRoleSchema = createRoleSchema.omit({ slug: true, scope: true }).partial()
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>

/** Replaces a role's entire grant set. */
export const setRolePermissionsSchema = z.object({
  permissions: z.array(permissionCodeSchema),
})
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>

/**
 * A scoped role assignment. Whether `firmId` / `branchId` are required depends
 * on the role's scope, which the server resolves from the role record - see
 * `assignmentShapeForScope`.
 */
export const roleAssignmentInputSchema = z.object({
  roleId: uuidSchema,
  firmId: uuidSchema.nullish(),
  branchId: uuidSchema.nullish(),
})
export type RoleAssignmentInput = z.infer<typeof roleAssignmentInputSchema>

export const roleAssignmentSchema = z.object({
  id: uuidSchema,
  roleId: uuidSchema,
  roleSlug: z.string(),
  roleName: z.string(),
  scope: roleScopeSchema,
  firmId: uuidSchema.nullable(),
  branchId: uuidSchema.nullable(),
})
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>
