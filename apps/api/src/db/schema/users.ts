import {
  boolean,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { softDelete, timestamps } from './columns'
import { userStatusEnum } from './enums'
import { tenants } from './tenants'

/**
 * A user belongs to exactly one tenant, except for platform operators
 * (super admins) whose `tenant_id` is NULL.
 *
 * A user's authority comes entirely from `user_roles`; there are no permission
 * columns here. `is_tenant_owner` only marks the account that cannot be locked
 * out of its own tenant.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL for platform-level accounts that operate across tenants. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    /** Always stored lower-cased; validation normalises it. */
    email: varchar('email', { length: 255 }).notNull(),
    /** NULL while a user is `invited` and has not set a password yet. */
    passwordHash: varchar('password_hash', { length: 255 }),
    fullName: varchar('full_name', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    status: userStatusEnum('status').notNull().default('invited'),
    isTenantOwner: boolean('is_tenant_owner').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    // Email is unique per tenant, so the same person can exist in two tenants.
    // NULLS NOT DISTINCT (Postgres 15+) makes this cover platform accounts too;
    // without it Postgres would treat every NULL tenant_id row as distinct and
    // allow duplicate super-admin emails.
    unique('users_tenant_email_key').on(table.tenantId, table.email).nullsNotDistinct(),
    index('users_tenant_idx').on(table.tenantId),
    index('users_tenant_status_idx').on(table.tenantId, table.status),
  ],
)

export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
