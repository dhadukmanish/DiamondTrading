import { and, asc, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import { currencies, productVariants, products } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { decorate } from '../../lib/party-doc';
import type { Ctx } from '../../lib/context';

const num = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] == null ? null : Number(o[k])]));
const HEAD = ['exchangeRate', 'withholdingRate', 'subtotal', 'taxableTotal', 'taxTotal', 'discountTotal', 'withholdingAmount', 'adjustment', 'roundOff', 'grandTotal', 'totalValue', 'shippingCharges', 'paidAmount', 'appliedAmount', 'amount', 'allocatedAmount', 'advanceApplied', 'advanceUsed'];
const LINE = ['qty', 'rate', 'discountValue', 'taxRatePct', 'gross', 'discount', 'taxable', 'tax', 'amount', 'billedQty', 'costValue'];

/** Reads a party document with lines + names; converts numerics. */
export async function readDoc<D extends PgTable & { id: any; tenantId: any }, L extends PgTable>(
  ctx: Ctx, docTable: D, lineTable: L, fk: any, id: string, label: string,
): Promise<D['$inferSelect'] & { contactName: string; currency?: { code: string; symbol: string }; items: (L['$inferSelect'] & { variant?: { id: string; productName: string; variantName: string; sku: string } })[] }> {
  const [doc] = await db.select().from(docTable as PgTable).where(and(eq(docTable.tenantId, ctx.tenantId), eq(docTable.id, id)));
  if (!doc) throw notFound(label);
  const lines = await db.select().from(lineTable as PgTable).where(eq(fk, id)).orderBy(asc((lineTable as never as { sortOrder: never }).sortOrder));
  const vids = lines.map((l) => (l as { variantId: string }).variantId);
  const vars = vids.length ? await db.select({ id: productVariants.id, productName: products.name, variantName: productVariants.name, sku: productVariants.sku }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(eq(products.tenantId, ctx.tenantId)) : [];
  const [cur] = await db.select({ code: currencies.code, symbol: currencies.symbol }).from(currencies).where(eq(currencies.id, (doc as { currencyId: string }).currencyId));
  const [d] = await decorate([doc as { contactId: string }]);
  return {
    ...d, ...num(doc as Record<string, unknown>, HEAD), currency: cur,
    items: lines.map((l) => ({ ...l, ...num(l as Record<string, unknown>, LINE), variant: vars.find((v) => v.id === (l as { variantId: string }).variantId) })),
  } as never;
}
