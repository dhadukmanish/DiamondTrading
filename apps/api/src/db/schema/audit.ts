import { jsonb, pgTable, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const auditLogs = pgTable('audit_logs', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  entityType: varchar('entity_type', { length: 60 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 30 }).notNull(),
  userId: uuid('user_id'),
  changes: jsonb('changes'),
}, (t) => ({ ix: index('audit_entity').on(t.entityType, t.entityId) }));
