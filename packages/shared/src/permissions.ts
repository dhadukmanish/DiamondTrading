/** Permission keys: `<module>.<action>`. Roles hold a set of these. */
export const MODULES = [
  'firms', 'branches', 'users', 'roles',
  'currencies', 'units', 'tax_rates', 'categories', 'payment_terms', 'sales_persons', 'locations',
  'document_series', 'custom_fields',
  'contacts', 'products', 'accounts',
  'stock_adjustment', 'stock_transfer', 'product_transfer', 'journal',
  'purchase_order', 'purchase_order_return', 'purchase_bill', 'debit_note', 'vendor_payment',
  'estimate', 'sales_order', 'sales_order_return', 'invoice', 'credit_note', 'customer_payment',
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}.${Action}`;

export const ALL_PERMISSIONS: Permission[] = MODULES.flatMap((m) =>
  ACTIONS.map((a) => `${m}.${a}` as Permission),
);
