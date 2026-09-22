import { char, index, jsonb, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { softDelete, timestamps } from './columns'
import { tenantStatusEnum } from './enums'

/**
 * A tenant is the top of the hierarchy: one subscribing organisation.
 * Everything below it (firms -> branches -> users) is scoped by `tenant_id`,
 * and no query may ever cross a tenant boundary except for platform-level
 * (super admin) operations.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    /** URL-safe identifier used to disambiguate logins across tenants. */
    slug: varchar('slug', { length: 40 }).notNull(),
    status: tenantStatusEnum('status').notNull().default('trial'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    baseCurrency: char('base_currency', { length: 3 }).notNull().default('INR'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    uniqueIndex('tenants_slug_key').on(table.slug),
    index('tenants_status_idx').on(table.status),
  ],
)

export type TenantRow = typeof tenants.$inferSelect
export type NewTenantRow = typeof tenants.$inferInsert
