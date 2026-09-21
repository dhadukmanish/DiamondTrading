import { boolean, integer, jsonb, numeric, pgTable, text, uuid, varchar, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const products = pgTable('products', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  serialNo: integer('serial_no').notNull(),
  productType: varchar('product_type', { length: 10 }).notNull().default('goods'),
  stockType: varchar('stock_type', { length: 20 }).notNull().default('general'),
  stockStatus: varchar('stock_status', { length: 24 }).notNull().default('available'),
  name: varchar('name', { length: 200 }).notNull(),
  unitId: uuid('unit_id'),
  hsnSac: varchar('hsn_sac', { length: 12 }),
  shortDescription: varchar('short_description', { length: 500 }),
  details: text('details'),
  purchaseEnabled: boolean('purchase_enabled').notNull().default(true),
  purchaseAccountId: uuid('purchase_account_id'),
  purchasePrice: numeric('purchase_price', { precision: 16, scale: 4 }).notNull().default('0'),
  salesEnabled: boolean('sales_enabled').notNull().default(true),
  salesAccountId: uuid('sales_account_id'),
  salesPrice: numeric('sales_price', { precision: 16, scale: 4 }).notNull().default('0'),
  currencyId: uuid('currency_id').notNull(),
  mrp: numeric('mrp', { precision: 16, scale: 4 }),
  taxRateId: uuid('tax_rate_id'),
  inventoryTracked: boolean('inventory_tracked').notNull().default(true),
  trackingType: varchar('tracking_type', { length: 20 }).notNull().default('sku'),
  custom: jsonb('custom').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({
  uq: uniqueIndex('products_tenant_serial').on(t.tenantId, t.serialNo),
  ix: index('products_tenant_name').on(t.tenantId, t.name),
}));

export const productCategories = pgTable('product_categories', {
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.productId, t.categoryId] }) }));

/** Sub-product. Stock, avg rate and prices live here; every product has ≥1 variant. */
export const productVariants = pgTable('product_variants', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  sku: varchar('sku', { length: 60 }).notNull(),
  barcode: varchar('barcode', { length: 60 }),
  purchasePrice: numeric('purchase_price', { precision: 16, scale: 4 }).notNull().default('0'),
  sellingPrice: numeric('selling_price', { precision: 16, scale: 4 }).notNull().default('0'),
  stockReminder: numeric('stock_reminder', { precision: 16, scale: 4 }).notNull().default('0'),
  category: varchar('category', { length: 60 }),
  custom: jsonb('custom').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({
  uq: uniqueIndex('variants_tenant_sku').on(t.tenantId, t.sku),
  ix: index('variants_product').on(t.productId),
}));

/** Per-tenant counters for serial numbers / SKUs (row-locked on use). */
export const counters = pgTable('counters', {
  tenantId: uuid('tenant_id').notNull(),
  key: varchar('key', { length: 40 }).notNull(),
  value: integer('value').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.key] }) }));
