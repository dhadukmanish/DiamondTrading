import { timestamp } from 'drizzle-orm/pg-core'

/**
 * Reusable column groups.
 *
 * These are functions rather than shared objects so every table gets its own
 * freshly built column instances.
 */

export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
}

/**
 * Financial and organisational records are never hard-deleted: a non-null
 * `deleted_at` hides the row. Every read path must filter on it.
 */
export function softDelete() {
  return {
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  }
}
