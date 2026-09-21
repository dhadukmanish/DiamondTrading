import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { productVariants, products, units } from '../../db/schema';
import type { Ctx } from '../../lib/context';

export interface VariantInfo { variantId: string; productId: string; productName: string; variantName: string; sku: string; unit: string | null; stockType: string; purchasePrice: number; sellingPrice: number }

/** Names/SKUs for a set of variants — used to decorate document lines and stock rows. */
export async function variantInfo(ctx: Ctx, ids: string[]): Promise<Map<string, VariantInfo>> {
  if (!ids.length) return new Map();
  const rows = await db.select({
    variantId: productVariants.id, productId: products.id, productName: products.name, variantName: productVariants.name, sku: productVariants.sku,
    unit: units.code, stockType: products.stockType, purchasePrice: productVariants.purchasePrice, sellingPrice: productVariants.sellingPrice,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).leftJoin(units, eq(units.id, products.unitId))
    .where(inArray(productVariants.id, [...new Set(ids)]));
  void ctx;
  return new Map(rows.map((r) => [r.variantId, { ...r, purchasePrice: Number(r.purchasePrice), sellingPrice: Number(r.sellingPrice) }]));
}
