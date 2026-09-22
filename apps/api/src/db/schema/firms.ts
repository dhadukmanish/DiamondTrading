import type { Address } from '@diamond/shared'
import { char, index, jsonb, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { softDelete, timestamps } from './columns'
import { entityStatusEnum } from './enums'
import { tenants } from './tenants'

/**
 * A firm is a legal entity belonging to a tenant - the level at which
 * registrations (GSTIN / PAN) and books of account live. A tenant may operate
 * several firms.
 */
export const firms = pgTable(
  'firms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    legalName: varchar('legal_name', { length: 200 }),
    /** Short identifier, unique within the tenant. */
    code: varchar('code', { length: 16 }).notNull(),
    gstin: varchar('gstin', { length: 15 }),
    pan: varchar('pan', { length: 10 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    baseCurrency: char('base_currency', { length: 3 }).notNull().default('INR'),
    address: jsonb('address').$type<Address>(),
    status: entityStatusEnum('status').notNull().default('active'),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    uniqueIndex('firms_tenant_code_key').on(table.tenantId, table.code),
    index('firms_tenant_idx').on(table.tenantId),
    index('firms_tenant_status_idx').on(table.tenantId, table.status),
  ],
)

export type FirmRow = typeof firms.$inferSelect
export type NewFirmRow = typeof firms.$inferInsert
