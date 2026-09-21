import { boolean, pgTable, text, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

/** Chart of accounts. Balances are never stored — derived from journal lines. */
export const accounts = pgTable('accounts', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id'),
  name: varchar('name', { length: 120 }).notNull(),
  type: varchar('type', { length: 12 }).notNull(),
  subType: varchar('sub_type', { length: 60 }).notNull(),
  parentId: uuid('parent_id'),
  currencyId: uuid('currency_id').notNull(),
  isGroup: boolean('is_group').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  systemKey: varchar('system_key', { length: 40 }),   // e.g. "accounts_payable" — used by posting rules
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ ix: index('accounts_tenant_type').on(t.tenantId, t.type), ixKey: index('accounts_system_key').on(t.tenantId, t.systemKey) }));
