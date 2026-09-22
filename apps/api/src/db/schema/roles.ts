import { boolean, index, pgTable, primaryKey, unique, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from './columns'
import { roleScopeEnum } from './enums'
import { permissions } from './permissions'
import { tenants } from './tenants'

/**
 * A role is a named bundle of permissions plus the hierarchy level it is
 * assigned at (`scope`).
 *
 * Built-in roles have `tenant_id = NULL` and `is_system = true`: they are
 * shared by every tenant and are not editable through the API. Tenants may
 * define additional roles, which are always scoped to themselves.
 */
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL for built-in roles shared across all tenants. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 40 }).notNull(),
    scope: roleScopeEnum('scope').notNull(),
    description: varchar('description', { length: 500 }),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    // NULLS NOT DISTINCT so the built-in (tenant_id IS NULL) slugs are unique
    // among themselves as well as per tenant. Expressed as a UNIQUE constraint
    // rather than a unique index because `nullsNotDistinct` is only available on
    // constraints in Drizzle; Postgres backs the constraint with a unique index
    // either way, so the guarantee is identical.
    unique('roles_tenant_slug_key').on(table.tenantId, table.slug).nullsNotDistinct(),
    index('roles_tenant_idx').on(table.tenantId),
  ],
)

/** Which permissions a role grants. */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index('role_permissions_permission_idx').on(table.permissionId),
  ],
)

export type RoleRow = typeof roles.$inferSelect
export type NewRoleRow = typeof roles.$inferInsert
export type RolePermissionRow = typeof rolePermissions.$inferSelect
