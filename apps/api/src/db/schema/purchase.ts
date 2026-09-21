import { boolean, date, index, integer, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';
import { docColumns } from './inventory-docs';

const money = (n: string) => numeric(n, { precision: 18, scale: 4 });

/** Header columns shared by party documents (vendor/customer side). */
export const partyDocColumns = {
  ...docColumns,
  contactId: uuid('contact_id').notNull(),
  shippingAddressId: uuid('shipping_address_id'),
  currencyId: uuid('currency_id').notNull(),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  taxType: varchar('tax_type', { length: 10 }).notNull().default('exclusive'),
  interstate: boolean('interstate').notNull().default(false),
  placeOfSupply: varchar('place_of_supply', { length: 5 }),
  withholdingType: varchar('withholding_type', { length: 5 }).notNull().default('none'),
  withholdingRate: numeric('withholding_rate', { precision: 6, scale: 3 }).notNull().default('0'),
  subtotal: money('subtotal').notNull().default('0'),
  taxableTotal: money('taxable_total').notNull().default('0'),
  taxTotal: money('tax_total').notNull().default('0'),
  discountTotal: money('discount_total').notNull().default('0'),
  withholdingAmount: money('withholding_amount').notNull().default('0'),
  adjustment: money('adjustment').notNull().default('0'),
  roundOff: money('round_off').notNull().default('0'),
  grandTotal: money('grand_total').notNull().default('0'),
  internalNotes: text('internal_notes'),
  printableNotes: text('printable_notes'),
};

/** Line columns shared by all party documents. */
const lineColumns = {
  ...baseColumns,
  variantId: uuid('variant_id').notNull(),
  description: varchar('description', { length: 500 }),
  hsnSac: varchar('hsn_sac', { length: 12 }),
  unitId: uuid('unit_id'),
  pcs: integer('pcs').notNull().default(0),
  qty: money('qty').notNull(),
  rate: money('rate').notNull(),
  discountType: varchar('discount_type', { length: 8 }).notNull().default('flat'),
  discountValue: money('discount_value').notNull().default('0'),
  taxRateId: uuid('tax_rate_id'),
  taxRatePct: numeric('tax_rate_pct', { precision: 6, scale: 3 }).notNull().default('0'),
  accountId: uuid('account_id'),
  gross: money('gross').notNull().default('0'),
  discount: money('discount').notNull().default('0'),
  taxable: money('taxable').notNull().default('0'),
  tax: money('tax').notNull().default('0'),
  amount: money('amount').notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
};

export const purchaseOrders = pgTable('purchase_orders', {
  ...partyDocColumns,
  vendorBillNo: varchar('vendor_bill_no', { length: 60 }),
  expectedDate: date('expected_date'),
}, (t) => ({ ix: index('po_tenant_date').on(t.tenantId, t.date), ixc: index('po_contact').on(t.contactId) }));

export const purchaseOrderItems = pgTable('purchase_order_items', {
  ...lineColumns,
  orderId: uuid('order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  billedQty: money('billed_qty').notNull().default('0'),
}, (t) => ({ ix: index('poi_order').on(t.orderId) }));

export const purchaseOrderReturns = pgTable('purchase_order_returns', {
  ...partyDocColumns,
}, (t) => ({ ix: index('por_tenant_date').on(t.tenantId, t.date) }));

export const purchaseOrderReturnItems = pgTable('purchase_order_return_items', {
  ...lineColumns,
  returnId: uuid('return_id').notNull().references(() => purchaseOrderReturns.id, { onDelete: 'cascade' }),
  costValue: money('cost_value').notNull().default('0'),
}, (t) => ({ ix: index('pori_return').on(t.returnId) }));

export const purchaseBills = pgTable('purchase_bills', {
  ...partyDocColumns,
  vendorBillNo: varchar('vendor_bill_no', { length: 60 }).notNull(),
  purchaseOrderId: uuid('purchase_order_id'),
  salesPersonId: uuid('sales_person_id'),
  paymentTermsId: uuid('payment_terms_id'),
  dueDate: date('due_date'),
  shippingCharges: money('shipping_charges').notNull().default('0'),
  paidAmount: money('paid_amount').notNull().default('0'),   // cache of Σ allocations (cash + advance + discount + writeoff + tds)
}, (t) => ({ ix: index('pb_tenant_date').on(t.tenantId, t.date), ixc: index('pb_contact').on(t.contactId) }));

export const purchaseBillItems = pgTable('purchase_bill_items', {
  ...lineColumns,
  billId: uuid('bill_id').notNull().references(() => purchaseBills.id, { onDelete: 'cascade' }),
  purchaseOrderItemId: uuid('purchase_order_item_id'),
}, (t) => ({ ix: index('pbi_bill').on(t.billId) }));

export const debitNotes = pgTable('debit_notes', {
  ...partyDocColumns,
  purchaseBillId: uuid('purchase_bill_id'),
  reason: varchar('reason', { length: 200 }),
  amountOnly: boolean('amount_only').notNull().default(false),
  appliedAmount: money('applied_amount').notNull().default('0'),
}, (t) => ({ ix: index('dn_tenant_date').on(t.tenantId, t.date), ixc: index('dn_contact').on(t.contactId) }));

export const debitNoteItems = pgTable('debit_note_items', {
  ...lineColumns,
  noteId: uuid('note_id').notNull().references(() => debitNotes.id, { onDelete: 'cascade' }),
  costValue: money('cost_value').notNull().default('0'),
}, (t) => ({ ix: index('dni_note').on(t.noteId) }));

export const vendorPayments = pgTable('vendor_payments', {
  ...docColumns,
  contactId: uuid('contact_id').notNull(),
  paymentType: varchar('payment_type', { length: 24 }).notNull(),
  paymentMode: varchar('payment_mode', { length: 16 }).notNull(),
  paidThroughAccountId: uuid('paid_through_account_id').notNull(),
  currencyId: uuid('currency_id').notNull(),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  amount: money('amount').notNull(),
  allocatedAmount: money('allocated_amount').notNull().default('0'),     // cash applied to bills / notes
  advanceApplied: money('advance_applied').notNull().default('0'),       // earlier advance consumed by this payment
  advanceUsed: money('advance_used').notNull().default('0'),             // how much of THIS payment's excess later payments consumed
  internalNotes: text('internal_notes'),
  printableNotes: text('printable_notes'),
}, (t) => ({ ix: index('vp_tenant_date').on(t.tenantId, t.date), ixc: index('vp_contact').on(t.contactId) }));

export const vendorPaymentAllocations = pgTable('vendor_payment_allocations', {
  ...baseColumns,
  paymentId: uuid('payment_id').notNull().references(() => vendorPayments.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: uuid('target_id').notNull(),
  amount: money('amount').notNull().default('0'),
  advanceAmount: money('advance_amount').notNull().default('0'),
  writeOff: money('write_off').notNull().default('0'),
  discount: money('discount').notNull().default('0'),
  withholding: money('withholding').notNull().default('0'),
}, (t) => ({ ix: index('vpa_target').on(t.targetType, t.targetId) }));

export const vendorPaymentAdvanceApplications = pgTable('vendor_payment_advance_applications', {
  ...baseColumns,
  paymentId: uuid('payment_id').notNull().references(() => vendorPayments.id, { onDelete: 'cascade' }),
  sourcePaymentId: uuid('source_payment_id').notNull(),
  amount: money('amount').notNull(),
});
