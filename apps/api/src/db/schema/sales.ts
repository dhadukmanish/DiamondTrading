import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';
import { docColumns } from './inventory-docs';
import { partyDocColumns } from './purchase';

const money = (n: string) => numeric(n, { precision: 18, scale: 4 });
const lineColumns = {
  ...baseColumns,
  variantId: uuid('variant_id').notNull(), description: varchar('description', { length: 500 }), hsnSac: varchar('hsn_sac', { length: 12 }), unitId: uuid('unit_id'),
  pcs: integer('pcs').notNull().default(0), qty: money('qty').notNull(), rate: money('rate').notNull(),
  discountType: varchar('discount_type', { length: 8 }).notNull().default('flat'), discountValue: money('discount_value').notNull().default('0'),
  taxRateId: uuid('tax_rate_id'), taxRatePct: numeric('tax_rate_pct', { precision: 6, scale: 3 }).notNull().default('0'), accountId: uuid('account_id'),
  gross: money('gross').notNull().default('0'), discount: money('discount').notNull().default('0'), taxable: money('taxable').notNull().default('0'), tax: money('tax').notNull().default('0'), amount: money('amount').notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
};

export const estimates = pgTable('estimates', {
  ...partyDocColumns, validUntil: date('valid_until'), salesPersonId: uuid('sales_person_id'), paymentTermsId: uuid('payment_terms_id'), detailHtml: text('detail_html'),
}, (t) => ({ ix: index('est_tenant_date').on(t.tenantId, t.date) }));
export const estimateItems = pgTable('estimate_items', { ...lineColumns, estimateId: uuid('estimate_id').notNull().references(() => estimates.id, { onDelete: 'cascade' }) }, (t) => ({ ix: index('esti_est').on(t.estimateId) }));

export const salesOrders = pgTable('sales_orders', {
  ...partyDocColumns, expectedDate: date('expected_date'), paymentTermsId: uuid('payment_terms_id'),
}, (t) => ({ ix: index('so_tenant_date').on(t.tenantId, t.date), ixc: index('so_contact').on(t.contactId) }));
export const salesOrderItems = pgTable('sales_order_items', {
  ...lineColumns, orderId: uuid('order_id').notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  invoicedQty: money('invoiced_qty').notNull().default('0'), invoicedPcs: integer('invoiced_pcs').notNull().default(0),
  returnedQty: money('returned_qty').notNull().default('0'), returnedPcs: integer('returned_pcs').notNull().default(0),
  lossQty: money('loss_qty').notNull().default('0'), lossPcs: integer('loss_pcs').notNull().default(0),
}, (t) => ({ ix: index('soi_order').on(t.orderId) }));

export const salesOrderReturns = pgTable('sales_order_returns', {
  ...docColumns, contactId: uuid('contact_id').notNull(), salesOrderId: uuid('sales_order_id').notNull(),
}, (t) => ({ ix: index('sor_order').on(t.salesOrderId) }));
export const salesOrderReturnItems = pgTable('sales_order_return_items', {
  ...baseColumns, returnId: uuid('return_id').notNull().references(() => salesOrderReturns.id, { onDelete: 'cascade' }), salesOrderItemId: uuid('sales_order_item_id').notNull(), variantId: uuid('variant_id').notNull(),
  returnQty: money('return_qty').notNull().default('0'), returnPcs: integer('return_pcs').notNull().default(0), lossQty: money('loss_qty').notNull().default('0'), lossPcs: integer('loss_pcs').notNull().default(0), lossValue: money('loss_value').notNull().default('0'),
});

export const invoices = pgTable('invoices', {
  ...partyDocColumns, consigneeContactId: uuid('consignee_contact_id'), salesPersonId: uuid('sales_person_id'), paymentTermsId: uuid('payment_terms_id'), dueDate: date('due_date'),
  termsConditions: text('terms_conditions'), costTotal: money('cost_total').notNull().default('0'), paidAmount: money('paid_amount').notNull().default('0'),
}, (t) => ({ ix: index('inv_tenant_date').on(t.tenantId, t.date), ixc: index('inv_contact').on(t.contactId) }));
export const invoiceItems = pgTable('invoice_items', {
  ...lineColumns, invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }), salesOrderItemId: uuid('sales_order_item_id'), costValue: money('cost_value').notNull().default('0'),
}, (t) => ({ ix: index('invi_inv').on(t.invoiceId) }));
export const invoiceSalesOrders = pgTable('invoice_sales_orders', { invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }), salesOrderId: uuid('sales_order_id').notNull() });
export const invoiceFollowups = pgTable('invoice_followups', {
  ...baseColumns, invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }), outcome: varchar('outcome', { length: 30 }).notNull(), channel: varchar('channel', { length: 12 }).notNull(),
  comment: text('comment'), nextFollowupAt: timestamp('next_followup_at', { withTimezone: true }), createdBy: uuid('created_by'),
}, (t) => ({ ix: index('fu_invoice').on(t.invoiceId) }));

export const creditNotes = pgTable('credit_notes', {
  ...partyDocColumns, invoiceId: uuid('invoice_id'), reason: varchar('reason', { length: 200 }), amountOnly: boolean('amount_only').notNull().default(false), appliedAmount: money('applied_amount').notNull().default('0'),
}, (t) => ({ ix: index('cn_tenant_date').on(t.tenantId, t.date), ixc: index('cn_contact').on(t.contactId) }));
export const creditNoteItems = pgTable('credit_note_items', {
  ...lineColumns, noteId: uuid('note_id').notNull().references(() => creditNotes.id, { onDelete: 'cascade' }), costValue: money('cost_value').notNull().default('0'),
}, (t) => ({ ix: index('cni_note').on(t.noteId) }));

export const customerPayments = pgTable('customer_payments', {
  ...docColumns, contactId: uuid('contact_id').notNull(), paymentType: varchar('payment_type', { length: 24 }).notNull(), paymentMode: varchar('payment_mode', { length: 16 }).notNull(),
  paidThroughAccountId: uuid('paid_through_account_id').notNull(), currencyId: uuid('currency_id').notNull(), exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  amount: money('amount').notNull(), allocatedAmount: money('allocated_amount').notNull().default('0'), advanceApplied: money('advance_applied').notNull().default('0'), advanceUsed: money('advance_used').notNull().default('0'),
  internalNotes: text('internal_notes'), printableNotes: text('printable_notes'),
}, (t) => ({ ix: index('cp_tenant_date').on(t.tenantId, t.date), ixc: index('cp_contact').on(t.contactId) }));
export const customerPaymentAllocations = pgTable('customer_payment_allocations', {
  ...baseColumns, paymentId: uuid('payment_id').notNull().references(() => customerPayments.id, { onDelete: 'cascade' }), targetType: varchar('target_type', { length: 20 }).notNull(), targetId: uuid('target_id').notNull(),
  amount: money('amount').notNull().default('0'), advanceAmount: money('advance_amount').notNull().default('0'), writeOff: money('write_off').notNull().default('0'), discount: money('discount').notNull().default('0'), withholding: money('withholding').notNull().default('0'),
}, (t) => ({ ix: index('cpa_target').on(t.targetType, t.targetId) }));
export const customerPaymentAdvanceApplications = pgTable('customer_payment_advance_applications', {
  ...baseColumns, paymentId: uuid('payment_id').notNull().references(() => customerPayments.id, { onDelete: 'cascade' }), sourcePaymentId: uuid('source_payment_id').notNull(), amount: money('amount').notNull(),
});
