import { date, index, integer, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

/** Columns every numbered document shares. */
export const docColumns = {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  seriesId: uuid('series_id').notNull(),
  number: integer('number').notNull(),
  docNo: varchar('doc_no', { length: 40 }).notNull(),
  date: date('date').notNull(),
  referenceNo: varchar('reference_no', { length: 60 }),
  notes: text('notes'),
  status: varchar('status', { length: 16 }).notNull(),
  totalValue: numeric('total_value', { precision: 18, scale: 4 }).notNull().default('0'),
  createdBy: uuid('created_by'),
};

export const stockAdjustments = pgTable('stock_adjustments', {
  ...docColumns,
  mode: varchar('mode', { length: 10 }).notNull().default('quantity'),
}, (t) => ({ ix: index('sa_tenant_date').on(t.tenantId, t.date) }));

export const stockAdjustmentItems = pgTable('stock_adjustment_items', {
  ...baseColumns,
  adjustmentId: uuid('adjustment_id').notNull().references(() => stockAdjustments.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull(),
  qtyAvailable: numeric('qty_available', { precision: 18, scale: 4 }).notNull().default('0'),
  qtyAdjusted: numeric('qty_adjusted', { precision: 18, scale: 4 }).notNull(),
  pcsAdjusted: integer('pcs_adjusted').notNull().default(0),
  rate: numeric('rate', { precision: 18, scale: 4 }).notNull().default('0'),
  value: numeric('value', { precision: 18, scale: 4 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const stockTransfers = pgTable('stock_transfers', {
  ...docColumns,
  toFirmId: uuid('to_firm_id').notNull(),
  toBranchId: uuid('to_branch_id').notNull(),
}, (t) => ({ ix: index('st_tenant_date').on(t.tenantId, t.date) }));

export const stockTransferItems = pgTable('stock_transfer_items', {
  ...baseColumns,
  transferId: uuid('transfer_id').notNull().references(() => stockTransfers.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull(),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  pcs: integer('pcs').notNull().default(0),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull().default('0'),
  total: numeric('total', { precision: 18, scale: 4 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const productTransfers = pgTable('product_transfers', {
  ...docColumns,
}, (t) => ({ ix: index('pt_tenant_date').on(t.tenantId, t.date) }));

export const productTransferItems = pgTable('product_transfer_items', {
  ...baseColumns,
  transferId: uuid('transfer_id').notNull().references(() => productTransfers.id, { onDelete: 'cascade' }),
  fromVariantId: uuid('from_variant_id').notNull(),
  toVariantId: uuid('to_variant_id').notNull(),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  pcs: integer('pcs').notNull().default(0),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull().default('0'),
  total: numeric('total', { precision: 18, scale: 4 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
});
