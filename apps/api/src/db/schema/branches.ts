import type { Address } from '@diamond/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { softDelete, timestamps } from './columns'
import { branchTypeEnum, entityStatusEnum } from './enums'
import { firms } from './firms'
import { tenants } from './tenants'

/**
 * A branch is a physical location of a firm (office, factory, vault, showroom).
 * It is the narrowest scope a user can be assigned to.
 *
 * `tenant_id` is denormalised from the parent firm so that every tenant-scoped
 * query can filter without an extra join; the two are kept in step by the
 * service layer, which always derives it from the firm being written to.
 */
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    /** Short identifier, unique within the firm. */
    code: varchar('code', { length: 16 }).notNull(),
    type: branchTypeEnum('type').notNull().default('office'),
    isHeadOffice: boolean('is_head_office').notNull().default(false),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    address: jsonb('address').$type<Address>(),
    status: entityStatusEnum('status').notNull().default('active'),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    uniqueIndex('branches_firm_code_key').on(table.firmId, table.code),
    // A firm has at most one head office. Enforced in the database rather than
    // only in application code because it is a hard business invariant.
    uniqueIndex('branches_one_head_office_per_firm')
      .on(table.firmId)
      .where(sql`${table.isHeadOffice} = true and ${table.deletedAt} is null`),
    index('branches_tenant_idx').on(table.tenantId),
    index('branches_firm_idx').on(table.firmId),
  ],
)

export type BranchRow = typeof branches.$inferSelect
export type NewBranchRow = typeof branches.$inferInsert
