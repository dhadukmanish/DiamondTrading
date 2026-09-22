import { index, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from './columns'
import { permissionActionEnum, permissionModuleEnum } from './enums'

/**
 * The permission catalog. Rows are seeded from `PERMISSIONS` in
 * @diamond/shared and are global - permissions are not tenant-specific, only
 * the roles that grant them are.
 */
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `<module>:<action>`, e.g. `firm:update`. */
    code: varchar('code', { length: 64 }).notNull(),
    module: permissionModuleEnum('module').notNull(),
    action: permissionActionEnum('action').notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('permissions_code_key').on(table.code),
    index('permissions_module_idx').on(table.module),
  ],
)

export type PermissionRow = typeof permissions.$inferSelect
export type NewPermissionRow = typeof permissions.$inferInsert
