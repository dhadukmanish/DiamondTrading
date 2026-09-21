/** Idempotent seed: one tenant, admin role/user, system masters. Run with `pnpm db:seed`. */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import { accounts, branches, currencies, documentSeries, firms, paymentTerms, rolePermissions, roles, taxRates, tenants, units, userRoles, users } from './schema/index';

async function main() {
  let [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) [tenant] = await db.insert(tenants).values({ name: 'Default Tenant' }).returning();
  const tenantId = tenant!.id;

  const cur = await upsertMany(currencies, tenantId, 'code', [
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' }, { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' }, { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  ]);
  const inr = cur.find((c) => c.code === 'INR')!;

  await upsertMany(units, tenantId, 'code', [
    { code: 'PCS', name: 'Pieces', decimals: 0 }, { code: 'CT', name: 'Carats', decimals: 3 },
    { code: 'G', name: 'Grams', decimals: 3 }, { code: 'KG', name: 'Kilograms', decimals: 3 }, { code: 'NOS', name: 'Numbers', decimals: 0 },
  ]);
  await upsertMany(taxRates, tenantId, 'name', [
    ...[0, 0.25, 1.5, 3, 5, 12, 18, 28].map((r) => ({ name: `GST ${r}%`, rate: String(r), type: 'gst' })),
    { name: 'Out of Scope', rate: '0', type: 'out_of_scope' }, { name: 'Exempt', rate: '0', type: 'exempt' },
  ]);
  await upsertMany(paymentTerms, tenantId, 'name', [
    { name: 'Due on receipt', days: 0, isDefault: true }, { name: 'Net 15', days: 15 }, { name: 'Net 30', days: 30 }, { name: 'Net 45', days: 45 },
  ]);

  let [firm] = await db.select().from(firms).where(eq(firms.tenantId, tenantId)).limit(1);
  if (!firm) {
    [firm] = await db.insert(firms).values({ tenantId, name: 'Royal Diamond', baseCurrencyId: inr.id, stateCode: '24', isDefault: true }).returning();
    await db.insert(branches).values({ tenantId, firmId: firm!.id, name: 'VESU', code: 'VESU', isDefault: true });
  }

  const seriesSeed: Array<[string, string]> = [
    ['purchase_order', 'POK'], ['purchase_order_return', 'PORK'], ['purchase_bill', 'PK'], ['debit_note', 'DNK'], ['vendor_payment', 'VPK'],
    ['estimate', 'EK'], ['sales_order', 'SOK'], ['sales_order_return', 'SORK'], ['invoice', 'IK'], ['credit_note', 'CNK'], ['customer_payment', 'CPK'],
    ['stock_adjustment', 'AK'], ['stock_transfer', 'STP'], ['product_transfer', 'ITK'], ['proforma_invoice', 'PIK'],
  ];
  const existing = await db.select({ docType: documentSeries.docType }).from(documentSeries).where(eq(documentSeries.tenantId, tenantId));
  const have = new Set(existing.map((s) => s.docType));
  const toAdd = seriesSeed.filter(([d]) => !have.has(d)).map(([docType, prefix]) => ({ tenantId, firmId: firm!.id, docType, prefix, isDefault: true }));
  if (toAdd.length) await db.insert(documentSeries).values(toAdd);

  const sysAccounts: Array<[string, string, string, string]> = [
    ['accounts_receivable', 'Accounts Receivable', 'asset', 'Accounts Receivable'], ['inventory_asset', 'Inventory Asset', 'asset', 'Inventory'],
    ['petty_cash', 'Petty Cash', 'asset', 'Cash'], ['undeposited_funds', 'Undeposited Funds', 'asset', 'Cash'],
    ['input_cgst', 'Input CGST', 'asset', 'Other Current Asset'], ['input_sgst', 'Input SGST', 'asset', 'Other Current Asset'], ['input_igst', 'Input IGST', 'asset', 'Other Current Asset'],
    ['tds_receivable', 'TDS Receivable', 'asset', 'Other Current Asset'], ['tcs_receivable', 'TCS Receivable', 'asset', 'Other Current Asset'], ['vendor_advances', 'Advances to Vendors', 'asset', 'Other Current Asset'], ['advance_tax', 'Advance Tax', 'asset', 'Other Current Asset'],
    ['accounts_payable', 'Accounts Payable', 'liability', 'Accounts Payable'], ['gst_payable', 'GST Payable', 'liability', 'Tax Payable'],
    ['output_cgst', 'Output CGST', 'liability', 'Tax Payable'], ['output_sgst', 'Output SGST', 'liability', 'Tax Payable'], ['output_igst', 'Output IGST', 'liability', 'Tax Payable'],
    ['tds_payable', 'TDS Payable', 'liability', 'Tax Payable'], ['tcs_payable', 'TCS Payable', 'liability', 'Tax Payable'], ['customer_advances', 'Advances from Customers', 'liability', 'Other Current Liability'],
    ['brokerage_payable', 'Brokerage Payable', 'liability', 'Other Current Liability'], ['employee_reimbursements', 'Employee Reimbursements', 'liability', 'Other Current Liability'],
    ['opening_balance_adjustments', 'Opening Balance Adjustments', 'liability', 'Other Current Liability'],
    ['opening_balance_equity', 'Opening Balance Equity', 'equity', 'Equity'], ['retained_earnings', 'Retained Earnings', 'equity', 'Equity'],
    ['sales', 'Sales', 'income', 'Sales'], ['discount_received', 'Discount Received', 'income', 'Other Income'], ['stock_adjustment_gain', 'Stock Adjustment (Gain)', 'income', 'Other Income'],
    ['rounding_off', 'Rounding Off', 'income', 'Other Income'],
    ['cogs', 'Cost of Goods Sold', 'expense', 'Cost of Goods Sold'], ['discount_allowed', 'Discount Allowed', 'expense', 'Expense'], ['bad_debts', 'Bad Debts', 'expense', 'Expense'],
    ['bank_fees', 'Bank Fees and Charges', 'expense', 'Expense'], ['brokerage_expense', 'Brokerage Expense', 'expense', 'Expense'], ['write_off', 'Write-off Expense', 'expense', 'Expense'],
    ['stock_adjustment_loss', 'Stock Adjustment (Loss)', 'expense', 'Expense'], ['purchase_variance', 'Purchase Price Variance', 'expense', 'Other Expense'], ['shipping_expense', 'Shipping & Freight', 'expense', 'Expense'], ['adjustment', 'Adjustment', 'expense', 'Other Expense'],
    ['dimension_adjustments', 'Dimension Adjustments', 'expense', 'Other Expense'],
  ];
  const haveAcc = new Set((await db.select({ k: accounts.systemKey }).from(accounts).where(eq(accounts.tenantId, tenantId))).map((a) => a.k));
  const newAcc = sysAccounts.filter(([k]) => !haveAcc.has(k)).map(([systemKey, name, type, subType]) => ({ tenantId, systemKey, name, type, subType, currencyId: inr.id, isSystem: true }));
  if (newAcc.length) await db.insert(accounts).values(newAcc);

  let [admin] = await db.select().from(roles).where(eq(roles.name, 'Administrator'));
  if (!admin) {
    [admin] = await db.insert(roles).values({ tenantId, name: 'Administrator', description: 'Full access', isSystem: true }).returning();
    await db.insert(rolePermissions).values({ roleId: admin!.id, permission: '*' });
  }

  let [user] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
  if (!user) {
    [user] = await db.insert(users).values({ tenantId, name: 'Admin', email: 'admin@example.com', passwordHash: await bcrypt.hash('admin123', 10), defaultFirmId: firm!.id }).returning();
    await db.insert(userRoles).values({ userId: user!.id, roleId: admin!.id });
  }
  console.log('Seed complete. Login: admin@example.com / admin123');
}

async function upsertMany<T extends { tenantId: never }>(table: any, tenantId: string, key: string, rows: Record<string, unknown>[]) {
  const existing = await db.select().from(table).where(eq(table.tenantId, tenantId));
  const have = new Set(existing.map((r: any) => r[key]));
  const fresh = rows.filter((r) => !have.has(r[key]));
  if (fresh.length) await db.insert(table).values(fresh.map((r) => ({ ...r, tenantId })));
  return db.select().from(table).where(eq(table.tenantId, tenantId)) as Promise<any[]>;
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
