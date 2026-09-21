import { z } from 'zod';
import { uuid } from './common.js';
import { docHeaderSchema } from './inventory.js';

export const taxTypes = ['exclusive', 'inclusive'] as const;
export const discountKinds = ['flat', 'percent'] as const;
export const withholdingTypes = ['none', 'tds', 'tcs'] as const;

/** One grid row on any purchase/sales document. */
export const transactionLineSchema = z.object({
  id: uuid.optional(),
  variantId: uuid,
  description: z.string().max(500).optional().nullable(),
  hsnSac: z.string().max(12).optional().nullable(),
  unitId: uuid.optional().nullable(),
  pcs: z.number().int().min(0).default(0),
  qty: z.number().positive(),
  rate: z.number().min(0),
  discountType: z.enum(discountKinds).default('flat'),
  discountValue: z.number().min(0).default(0),
  taxRateId: uuid.optional().nullable(),
  accountId: uuid.optional().nullable(),        // overrides product account (debit/credit notes)
  sourceLineId: uuid.optional().nullable(),     // PO / SO line this line was pulled from
});
export type TransactionLineInput = z.infer<typeof transactionLineSchema>;

/** Header fields shared by every party document (PO, bill, invoice…). */
export const partyDocSchema = docHeaderSchema.extend({
  contactId: uuid,
  shippingAddressId: uuid.optional().nullable(),
  currencyId: uuid,
  exchangeRate: z.number().positive().default(1),
  taxType: z.enum(taxTypes).default('exclusive'),
  withholdingType: z.enum(withholdingTypes).default('none'),
  withholdingRate: z.number().min(0).max(100).default(0),
  adjustment: z.number().default(0),
  internalNotes: z.string().max(2000).optional().nullable(),
  printableNotes: z.string().max(2000).optional().nullable(),
  items: z.array(transactionLineSchema).min(1),
});

export const purchaseOrderSchema = partyDocSchema.extend({
  vendorBillNo: z.string().max(60).optional().nullable(),
  expectedDate: z.string().date().optional().nullable(),
  status: z.enum(['draft', 'open']).default('open'),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const purchaseOrderReturnSchema = partyDocSchema.extend({
  status: z.enum(['draft', 'confirmed']).default('confirmed'),
});
export type PurchaseOrderReturnInput = z.infer<typeof purchaseOrderReturnSchema>;

export const purchaseBillSchema = partyDocSchema.extend({
  vendorBillNo: z.string().min(1).max(60),
  purchaseOrderId: uuid.optional().nullable(),
  salesPersonId: uuid.optional().nullable(),
  paymentTermsId: uuid.optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  shippingCharges: z.number().min(0).default(0),
  status: z.enum(['draft', 'open']).default('open'),
});
export type PurchaseBillInput = z.infer<typeof purchaseBillSchema>;

export const debitNoteSchema = partyDocSchema.extend({
  purchaseBillId: uuid.optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  amountOnly: z.boolean().default(false),       // "Only Correction in Amount" — no stock movement
  status: z.enum(['draft', 'open']).default('open'),
});
export type DebitNoteInput = z.infer<typeof debitNoteSchema>;

export const paymentTypes = ['payment', 'debit_note_payment', 'advance', 'refund'] as const;
export const paymentModes = ['bank_transfer', 'cash', 'cheque', 'credit_card', 'debit_card', 'upi', 'others'] as const;

export const vendorPaymentSchema = docHeaderSchema.extend({
  contactId: uuid,
  paymentType: z.enum(paymentTypes).default('payment'),
  paymentMode: z.enum(paymentModes),
  paidThroughAccountId: uuid,
  currencyId: uuid,
  exchangeRate: z.number().positive().default(1),
  amount: z.number().min(0),
  internalNotes: z.string().max(2000).optional().nullable(),
  printableNotes: z.string().max(2000).optional().nullable(),
  allocations: z.array(z.object({
    targetType: z.enum(['purchase_bill', 'debit_note']),
    targetId: uuid,
    amount: z.number().min(0).default(0),          // cash applied
    writeOff: z.number().min(0).default(0),
    discountType: z.enum(discountKinds).default('flat'),
    discountValue: z.number().min(0).default(0),
    withholdingType: z.enum(withholdingTypes).default('none'),
    withholdingRate: z.number().min(0).max(100).default(0),
  })).default([]),
  advanceApplied: z.number().min(0).default(0),   // taken from vendor's available advance, applied to the same bills (oldest first)
  status: z.enum(['draft', 'paid']).default('paid'),
});
export type VendorPaymentInput = z.infer<typeof vendorPaymentSchema>;
