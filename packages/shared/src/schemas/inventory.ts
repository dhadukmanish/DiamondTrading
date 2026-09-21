import { z } from 'zod';
import { uuid } from './common.js';

/** Header shared by every numbered document. */
export const docHeaderSchema = z.object({
  firmId: uuid,
  branchId: uuid,
  seriesId: uuid,
  number: z.number().int().positive().optional(),   // unregulated series may override
  date: z.string().date(),
  referenceNo: z.string().max(60).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const adjustmentModes = ['quantity', 'value'] as const;
export const stockAdjustmentSchema = docHeaderSchema.extend({
  mode: z.enum(adjustmentModes).default('quantity'),
  items: z.array(z.object({
    variantId: uuid,
    qtyAdjusted: z.number().refine((n) => n !== 0, 'Quantity cannot be 0'),   // + adds, − removes
    pcsAdjusted: z.number().int().default(0),
    rate: z.number().min(0).default(0),        // used for additions; removals cost out at FIFO
  })).min(1),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const stockTransferSchema = docHeaderSchema.extend({
  toFirmId: uuid,
  toBranchId: uuid,
  items: z.array(z.object({ variantId: uuid, qty: z.number().positive(), pcs: z.number().int().min(0).default(0) })).min(1),
}).refine((d) => d.branchId !== d.toBranchId, { message: 'From and To branch must differ', path: ['toBranchId'] });
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

export const productTransferSchema = docHeaderSchema.extend({
  items: z.array(z.object({
    fromVariantId: uuid, toVariantId: uuid, qty: z.number().positive(), pcs: z.number().int().min(0).default(0),
  }).refine((i) => i.fromVariantId !== i.toVariantId, { message: 'From and To product must differ' })).min(1),
});
export type ProductTransferInput = z.infer<typeof productTransferSchema>;

export const stockQuerySchema = z.object({
  firmId: uuid.optional(),
  branchId: uuid.optional(),
  search: z.string().optional(),
  hideZero: z.coerce.boolean().default(false),
  stockType: z.string().optional(),
});

export const historyQuerySchema = z.object({
  variantId: uuid,
  firmId: uuid.optional(),
  branchId: uuid.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
