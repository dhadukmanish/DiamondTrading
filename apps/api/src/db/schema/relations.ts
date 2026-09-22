import { relations } from 'drizzle-orm'

import { auditLogs } from './audit-logs'
import { branches } from './branches'
import { firms } from './firms'
import { permissions } from './permissions'
import { refreshTokens } from './refresh-tokens'
import { rolePermissions, roles } from './roles'
import { tenants } from './tenants'
import { userRoles } from './user-roles'
import { users } from './users'

/**
 * Relations for the Drizzle relational query API (`db.query.*`). They are
 * metadata only and do not affect the generated SQL schema.
 */

export const tenantsRelations = relations(tenants, ({ many }) => ({
  firms: many(firms),
  branches: many(branches),
  users: many(users),
  roles: many(roles),
  auditLogs: many(auditLogs),
}))

export const firmsRelations = relations(firms, ({ one, many }) => ({
  tenant: one(tenants, { fields: [firms.tenantId], references: [tenants.id] }),
  branches: many(branches),
}))

export const branchesRelations = relations(branches, ({ one }) => ({
  tenant: one(tenants, { fields: [branches.tenantId], references: [tenants.id] }),
  firm: one(firms, { fields: [branches.firmId], references: [firms.id] }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  assignments: many(userRoles),
  refreshTokens: many(refreshTokens),
}))

export const rolesRelations = relations(roles, ({ one, many }) => ({
  tenant: one(tenants, { fields: [roles.tenantId], references: [tenants.id] }),
  rolePermissions: many(rolePermissions),
  assignments: many(userRoles),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  tenant: one(tenants, { fields: [userRoles.tenantId], references: [tenants.id] }),
  firm: one(firms, { fields: [userRoles.firmId], references: [firms.id] }),
  branch: one(branches, { fields: [userRoles.branchId], references: [branches.id] }),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}))
