import { boolean, integer, pgTable, text, uuid, varchar, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const tenants = pgTable('tenants', {
  ...baseColumns,
  name: varchar('name', { length: 150 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const currencies = pgTable('currencies', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  code: varchar('code', { length: 3 }).notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  symbol: varchar('symbol', { length: 5 }).notNull(),
  decimals: integer('decimals').notNull().default(2),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ uq: uniqueIndex('currencies_tenant_code').on(t.tenantId, t.code) }));

export const firms = pgTable('firms', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  gstin: varchar('gstin', { length: 20 }),
  pan: varchar('pan', { length: 20 }),
  address: text('address'),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 150 }),
  stateCode: varchar('state_code', { length: 5 }),
  countryId: uuid('country_id'),
  baseCurrencyId: uuid('base_currency_id').notNull().references(() => currencies.id),
  dateFormat: varchar('date_format', { length: 12 }).notNull().default('DD-MM-YYYY'),
  fyStartMonth: integer('fy_start_month').notNull().default(4),
  gstApplicable: boolean('gst_applicable').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ ix: index('firms_tenant').on(t.tenantId) }));

export const branches = pgTable('branches', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  code: varchar('code', { length: 20 }),
  address: text('address'),
  stateCode: varchar('state_code', { length: 5 }),
  defaultCurrencyId: uuid('default_currency_id').references(() => currencies.id),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ ix: index('branches_firm').on(t.firmId) }));

export const users = pgTable('users', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 150 }).notNull(),
  passwordHash: varchar('password_hash', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  defaultFirmId: uuid('default_firm_id'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ uq: uniqueIndex('users_tenant_email').on(t.tenantId, t.email) }));

export const roles = pgTable('roles', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  description: varchar('description', { length: 300 }),
  isSystem: boolean('is_system').notNull().default(false),
}, (t) => ({ uq: uniqueIndex('roles_tenant_name').on(t.tenantId, t.name) }));

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permission: varchar('permission', { length: 80 }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permission] }) }));

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.roleId] }) }));

/** Firm access. No rows for a user = access to all firms of the tenant. */
export const userFirms = pgTable('user_firms', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.firmId] }) }));
