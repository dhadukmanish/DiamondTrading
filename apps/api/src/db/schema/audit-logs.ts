import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { branches } from './branches'
import { firms } from './firms'
import { tenants } from './tenants'
import { users } from './users'

/**
 * Append-only audit trail. Rows are never updated or deleted; the actor
 * reference is nullable and set null on user deletion so history survives.
 *
 * `before` / `after` hold the changed subset of the record, not the whole row.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'set null' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    /** NULL for system-initiated changes (migrations, seeds, jobs). */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** e.g. `firm.created`, `user.role_assigned`, `auth.login_failed`. */
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_actor_idx').on(table.actorId),
  ],
)

export type AuditLogRow = typeof auditLogs.$inferSelect
export type NewAuditLogRow = typeof auditLogs.$inferInsert
