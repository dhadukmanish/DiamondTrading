import { boolean, integer, numeric, pgTable, uuid, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const units = pgTable('units', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  code: varchar('code', { length: 10 }).notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  decimals: integer('decimals').notNull().default(2),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ uq: uniqueIndex('units_tenant_code').on(t.tenantId, t.code) }));

export const taxRates = pgTable('tax_rates', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  rate: numeric('rate', { precision: 6, scale: 3 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('gst'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ uq: uniqueIndex('tax_rates_tenant_name').on(t.tenantId, t.name) }));

export const categories = pgTable('categories', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ ix: index('categories_tenant').on(t.tenantId) }));

export const paymentTerms = pgTable('payment_terms', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  days: integer('days').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
}, (t) => ({ ix: index('payment_terms_tenant').on(t.tenantId) }));

export const salesPersons = pgTable('sales_persons', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 150 }),
  phone: varchar('phone', { length: 30 }),
  userId: uuid('user_id'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ ix: index('sales_persons_tenant').on(t.tenantId) }));

/** Country / State / City / Area in one self-referencing table. */
export const locations = pgTable('locations', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  kind: varchar('kind', { length: 10 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  code: varchar('code', { length: 10 }),
  parentId: uuid('parent_id'),
}, (t) => ({ ix: index('locations_tenant_kind_parent').on(t.tenantId, t.kind, t.parentId) }));
