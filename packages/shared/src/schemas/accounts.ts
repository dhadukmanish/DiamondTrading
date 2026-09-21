import { z } from 'zod';
import { uuid } from './common.js';

export const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof accountTypes)[number];

export const accountSubTypes: Record<AccountType, string[]> = {
  asset: ['Cash', 'Bank', 'Accounts Receivable', 'Inventory', 'Fixed Asset', 'Other Current Asset', 'Other Asset'],
  liability: ['Accounts Payable', 'Credit Card', 'Tax Payable', 'Other Current Liability', 'Long Term Liability'],
  equity: ['Equity'],
  income: ['Sales', 'Other Income'],
  expense: ['Cost of Goods Sold', 'Expense', 'Other Expense'],
};

/** Debit-nature types increase with a debit. */
export const accountNature = (t: AccountType) => (t === 'asset' || t === 'expense' ? 'debit' : 'credit');

export const accountSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(accountTypes),
  subType: z.string().min(1).max(60),
  firmId: uuid.optional().nullable(),      // null = all firms
  parentId: uuid.optional().nullable(),
  currencyId: uuid,
  isGroup: z.boolean().default(false),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type AccountInput = z.infer<typeof accountSchema>;
