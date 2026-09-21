import { boolean, integer, pgTable, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const documentSeries = pgTable('document_series', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id'),
  branchId: uuid('branch_id'),
  docType: varchar('doc_type', { length: 40 }).notNull(),
  prefix: varchar('prefix', { length: 20 }).notNull(),
  separator: varchar('separator', { length: 3 }).notNull().default('-'),
  useFinancialYear: boolean('use_financial_year').notNull().default(true),
  nextNumber: integer('next_number').notNull().default(1),
  padding: integer('padding').notNull().default(0),
  seriesType: varchar('series_type', { length: 12 }).notNull().default('regulated'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ ix: index('document_series_lookup').on(t.tenantId, t.docType, t.firmId) }));
