import { date, index, integer, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

const money = (n: string) => numeric(n, { precision: 18, scale: 4 });
const qty = (n: string) => numeric(n, { precision: 18, scale: 4 });

/** Every transaction posts exactly one entry (status posted); deleting a document deletes its entry. */
export const journalEntries = pgTable('journal_entries', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id').notNull(),
  branchId: uuid('branch_id'),
  date: date('date').notNull(),
  sourceType: varchar('source_type', { length: 40 }).notNull(),   // doc type
  sourceId: uuid('source_id').notNull(),
  docNo: varchar('doc_no', { length: 40 }).notNull(),
  narration: text('narration'),
  status: varchar('status', { length: 12 }).notNull().default('posted'),
  createdBy: uuid('created_by'),
}, (t) => ({ ix: index('je_source').on(t.sourceType, t.sourceId), ixDate: index('je_firm_date').on(t.firmId, t.date) }));

/** Amounts in the firm's base currency. */
export const journalLines = pgTable('journal_lines', {
  ...baseColumns,
  entryId: uuid('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull(),
  contactId: uuid('contact_id'),
  variantId: uuid('variant_id'),
  debit: money('debit').notNull().default('0'),
  credit: money('credit').notNull().default('0'),
  narration: varchar('narration', { length: 300 }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({ ixAcc: index('jl_account').on(t.accountId), ixContact: index('jl_contact').on(t.contactId) }));

/** One row per line of stock in/out. Levels and history are derived from here. */
export const stockMovements = pgTable('stock_movements', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  date: date('date').notNull(),
  direction: varchar('direction', { length: 3 }).notNull(),   // in | out
  qty: qty('qty').notNull(),
  pcs: integer('pcs').notNull().default(0),
  rate: money('rate').notNull().default('0'),     // unit cost (IN: purchase cost; OUT: FIFO cost)
  value: money('value').notNull().default('0'),
  sourceType: varchar('source_type', { length: 40 }).notNull(),
  sourceId: uuid('source_id').notNull(),
  sourceLineId: uuid('source_line_id'),
  contactId: uuid('contact_id'),
  docNo: varchar('doc_no', { length: 40 }),
  note: varchar('note', { length: 300 }),
}, (t) => ({
  ixVar: index('sm_variant_branch_date').on(t.variantId, t.branchId, t.date),
  ixSrc: index('sm_source').on(t.sourceType, t.sourceId),
}));

/** FIFO cost layers. Each IN movement opens one lot; OUTs consume oldest first. */
export const stockLots = pgTable('stock_lots', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  movementId: uuid('movement_id').notNull().references(() => stockMovements.id, { onDelete: 'cascade' }),
  receivedAt: date('received_at').notNull(),
  qtyIn: qty('qty_in').notNull(),
  qtyRemaining: qty('qty_remaining').notNull(),
  pcsIn: integer('pcs_in').notNull().default(0),
  pcsRemaining: integer('pcs_remaining').notNull().default(0),
  rate: money('rate').notNull(),
}, (t) => ({ ix: index('lot_fifo').on(t.variantId, t.branchId, t.receivedAt, t.createdAt) }));

export const stockLotConsumptions = pgTable('stock_lot_consumptions', {
  ...baseColumns,
  movementId: uuid('movement_id').notNull().references(() => stockMovements.id, { onDelete: 'cascade' }),
  lotId: uuid('lot_id').notNull().references(() => stockLots.id, { onDelete: 'cascade' }),
  qty: qty('qty').notNull(),
  pcs: integer('pcs').notNull().default(0),
  rate: money('rate').notNull(),
}, (t) => ({ ix: index('lc_lot').on(t.lotId) }));
