import { boolean, integer, pgTable, uuid, varchar, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const customFields = pgTable('custom_fields', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  module: varchar('module', { length: 60 }).notNull(),
  key: varchar('key', { length: 60 }).notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  required: boolean('required').notNull().default(false),
  showInList: boolean('show_in_list').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ uq: uniqueIndex('custom_fields_module_key').on(t.tenantId, t.module, t.key) }));

/** `value` is stored on the record's custom JSONB; `displayValue` is what the UI shows. */
export const customFieldOptions = pgTable('custom_field_options', {
  ...baseColumns,
  fieldId: uuid('field_id').notNull().references(() => customFields.id, { onDelete: 'cascade' }),
  value: varchar('value', { length: 100 }).notNull(),
  displayValue: varchar('display_value', { length: 100 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({ ix: index('custom_field_options_field').on(t.fieldId) }));
