import { z } from 'zod';
import { uuid } from './common.js';

/** Every numbered document type in the system. */
export const docTypes = [
  'purchase_order', 'purchase_order_return', 'purchase_bill', 'debit_note', 'vendor_payment',
  'estimate', 'proforma_invoice', 'sales_order', 'sales_order_return', 'invoice', 'credit_note', 'customer_payment',
  'stock_adjustment', 'stock_transfer', 'product_transfer', 'journal', 'expense',
  'manufacturing_issue', 'manufacturing_receive', 'material_recovery', 'customer_metal_receipt', 'vendor_material_issue',
] as const;
export type DocType = (typeof docTypes)[number];

export const documentSeriesSchema = z.object({
  firmId: uuid.optional().nullable(),      // null = all firms
  branchId: uuid.optional().nullable(),    // null = firm-level counter
  docType: z.enum(docTypes),
  prefix: z.string().min(1).max(20),       // "POK"
  separator: z.string().max(3).default('-'),
  useFinancialYear: z.boolean().default(true),   // adds "26/27"
  nextNumber: z.number().int().min(1).default(1),
  padding: z.number().int().min(0).max(8).default(0),
  seriesType: z.enum(['regulated', 'unregulated']).default('regulated'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type DocumentSeriesInput = z.infer<typeof documentSeriesSchema>;
