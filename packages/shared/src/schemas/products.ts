import { z } from 'zod';
import { uuid } from './common.js';

export const productTypes = ['goods', 'service'] as const;
export const stockTypes = ['general', 'loose_diamond', 'metal', 'stone', 'certified', 'jewellery'] as const;
export const stockStatuses = ['available', 'stock_out', 'temporary_stock_out', 'disabled'] as const;
export const trackingTypes = ['sku'] as const;

export const productVariantSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(150),
  sku: z.string().max(60).optional().nullable(),      // auto if blank
  barcode: z.string().max(60).optional().nullable(),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  stockReminder: z.number().min(0).default(0),
  category: z.string().max(60).optional().nullable(),  // CVD / HPHT / NATURAL
  custom: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

export const productSchema = z.object({
  productType: z.enum(productTypes).default('goods'),
  stockType: z.enum(stockTypes).default('general'),
  stockStatus: z.enum(stockStatuses).default('available'),
  name: z.string().min(1).max(200),
  serialNo: z.number().int().positive().optional(),
  unitId: uuid.optional().nullable(),
  hsnSac: z.string().max(12).optional().nullable(),
  categoryIds: z.array(uuid).default([]),
  shortDescription: z.string().max(500).optional().nullable(),
  details: z.string().optional().nullable(),
  purchaseEnabled: z.boolean().default(true),
  purchaseAccountId: uuid.optional().nullable(),
  purchasePrice: z.number().min(0).default(0),
  salesEnabled: z.boolean().default(true),
  salesAccountId: uuid.optional().nullable(),
  salesPrice: z.number().min(0).default(0),
  currencyId: uuid,
  mrp: z.number().min(0).optional().nullable(),
  taxRateId: uuid.optional().nullable(),
  inventoryTracked: z.boolean().default(true),
  trackingType: z.enum(trackingTypes).default('sku'),
  custom: z.record(z.unknown()).default({}),
  variants: z.array(productVariantSchema).default([]),
  isActive: z.boolean().default(true),
}).superRefine((p, ctx) => {
  if (p.purchaseEnabled && !p.purchaseAccountId) ctx.addIssue({ code: 'custom', path: ['purchaseAccountId'], message: 'Purchase account is required' });
  if (p.salesEnabled && !p.salesAccountId) ctx.addIssue({ code: 'custom', path: ['salesAccountId'], message: 'Sales account is required' });
});
export type ProductInput = z.infer<typeof productSchema>;
