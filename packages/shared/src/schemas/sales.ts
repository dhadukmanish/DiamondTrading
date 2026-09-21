import { z } from 'zod';
import { uuid } from './common.js';
import { docHeaderSchema } from './inventory.js';
import { partyDocSchema, discountKinds, paymentModes, paymentTypes, withholdingTypes } from './transactions.js';

export const estimateSchema = partyDocSchema.extend({
  validUntil: z.string().date().optional().nullable(),
  salesPersonId: uuid.optional().nullable(),
  paymentTermsId: uuid.optional().nullable(),
  detailHtml: z.string().optional().nullable(),
  status: z.enum(['draft', 'sent', 'accepted', 'closed']).default('sent'),
});
export type EstimateInput = z.infer<typeof estimateSchema>;

/** Sales Order = memo/approval: open orders commit stock; qty leaves stock only when invoiced. */
export const salesOrderSchema = partyDocSchema.extend({
  expectedDate: z.string().date().optional().nullable(),
  paymentTermsId: uuid.optional().nullable(),
  status: z.enum(['draft', 'open']).default('open'),
});
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;

/** Return Stock screen: per SO line, what came back and what was lost. */
export const salesOrderReturnSchema = z.object({
  salesOrderId: uuid,
  seriesId: uuid,
  number: z.number().int().positive().optional(),
  date: z.string().date(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(z.object({ salesOrderItemId: uuid, returnQty: z.number().min(0).default(0), returnPcs: z.number().int().min(0).default(0), lossQty: z.number().min(0).default(0), lossPcs: z.number().int().min(0).default(0) })).min(1),
});
export type SalesOrderReturnInput = z.infer<typeof salesOrderReturnSchema>;

export const invoiceSchema = partyDocSchema.extend({
  consigneeContactId: uuid.optional().nullable(),
  salesPersonId: uuid.optional().nullable(),
  paymentTermsId: uuid.optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  termsConditions: z.string().max(4000).optional().nullable(),
  salesOrderIds: z.array(uuid).default([]),
  status: z.enum(['draft', 'open']).default('open'),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const creditNoteSchema = partyDocSchema.extend({
  invoiceId: uuid.optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  amountOnly: z.boolean().default(false),
  status: z.enum(['draft', 'open']).default('open'),
});
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

export const customerPaymentTypes = ['payment', 'credit_note_payment', 'advance', 'refund'] as const;
export const customerPaymentSchema = docHeaderSchema.extend({
  contactId: uuid,
  paymentType: z.enum(customerPaymentTypes).default('payment'),
  paymentMode: z.enum(paymentModes),
  paidThroughAccountId: uuid,       // "Deposit To"
  currencyId: uuid,
  exchangeRate: z.number().positive().default(1),
  amount: z.number().min(0),
  internalNotes: z.string().max(2000).optional().nullable(),
  printableNotes: z.string().max(2000).optional().nullable(),
  allocations: z.array(z.object({
    targetType: z.enum(['invoice', 'credit_note']),
    targetId: uuid,
    amount: z.number().min(0).default(0),
    writeOff: z.number().min(0).default(0),
    discountType: z.enum(discountKinds).default('flat'),
    discountValue: z.number().min(0).default(0),
    withholdingType: z.enum(withholdingTypes).default('none'),
    withholdingRate: z.number().min(0).max(100).default(0),
  })).default([]),
  advanceApplied: z.number().min(0).default(0),
  status: z.enum(['draft', 'paid']).default('paid'),
});
export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;

export const followupOutcomes = ['promised_to_pay', 'partial_payment_promised', 'no_response', 'disputed', 'other'] as const;
export const followupChannels = ['call', 'whatsapp', 'email', 'visit', 'other'] as const;
export const invoiceFollowupSchema = z.object({
  outcome: z.enum(followupOutcomes),
  channel: z.enum(followupChannels),
  comment: z.string().max(2000).optional().nullable(),
  nextFollowupAt: z.string().datetime().optional().nullable(),
});
void paymentTypes;
