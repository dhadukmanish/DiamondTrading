import { index, pgTable, unique, uuid } from 'drizzle-orm/pg-core'

import { branches } from './branches'
import { timestamps } from './columns'
import { firms } from './firms'
import { roles } from './roles'
import { tenants } from './tenants'
import { users } from './users'

/**
 * A scoped role assignment - the join that makes the hierarchy meaningful:
 *
 *   platform role -> firm_id NULL, branch_id NULL (all tenants)
 *   tenant role   -> firm_id NULL, branch_id NULL (whole tenant)
 *   firm role     -> firm_id set,  branch_id NULL (one firm, all its branches)
 *   branch role   -> firm_id set,  branch_id set  (a single branch)
 *
 * The scope/column agreement is validated in the service layer against the
 * role's `scope` (see `assignmentShapeForScope` in @diamond/shared), because it
 * depends on a value in another table.
 *
 * A user may hold several assignments; effective permissions are the union.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    /** NULL only for platform-level assignments. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => [
    // The same role at the same scope must not be assigned twice. NULLS NOT
    // DISTINCT is essential here: firm_id / branch_id are legitimately NULL for
    // tenant- and platform-scoped assignments.
    unique('user_roles_unique_assignment')
      .on(table.userId, table.roleId, table.firmId, table.branchId)
      .nullsNotDistinct(),
    index('user_roles_user_idx').on(table.userId),
    index('user_roles_tenant_idx').on(table.tenantId),
    index('user_roles_firm_idx').on(table.firmId),
    index('user_roles_branch_idx').on(table.branchId),
  ],
)

export type UserRoleRow = typeof userRoles.$inferSelect
export type NewUserRoleRow = typeof userRoles.$inferInsert
