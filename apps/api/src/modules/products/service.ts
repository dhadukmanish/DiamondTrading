import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import type { ListQuery, ProductInput } from '@erp/shared';
import { db, type Tx } from '../../db/client';
import { productCategories, productVariants, products } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { buildListQuery, countRows } from '../../lib/list-query';
import { nextCounter } from '../../lib/counters';
import type { Ctx } from '../../lib/context';

const cols = { name: products.name, serialNo: products.serialNo, stockType: products.stockType, stockStatus: products.stockStatus, productType: products.productType, createdAt: products.createdAt, isActive: products.isActive };

export async function listProducts(ctx: Ctx, q: ListQuery) {
  const { where, orderBy, limit, offset } = buildListQuery(products, q, { searchable: [products.name, products.hsnSac], columns: cols, defaultSort: 'name' });
  const scope = and(eq(products.tenantId, ctx.tenantId), where);
  const [rows, cnt] = await Promise.all([
    db.select().from(products).where(scope).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: countRows.as('total') }).from(products).where(scope),
  ]);
  const ids = rows.map((r) => r.id);
  const variants = ids.length ? await db.select().from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(asc(productVariants.createdAt)) : [];
  return {
    rows: rows.map((p) => ({ ...num(p), variants: variants.filter((v) => v.productId === p.id).map(numV), stock: 0, avgRate: 0 })),
    total: cnt[0]?.total ?? 0, page: q.page, pageSize: q.pageSize,
  };
}

/** Product + variant picker for transaction lines: matches name / SKU / barcode. */
export async function searchVariants(ctx: Ctx, term?: string, stockType?: string) {
  const rows = await db.select({
    variantId: productVariants.id, productId: products.id, productName: products.name, variantName: productVariants.name, sku: productVariants.sku,
    stockType: products.stockType, productType: products.productType, unitId: products.unitId, hsnSac: products.hsnSac, taxRateId: products.taxRateId,
    purchasePrice: productVariants.purchasePrice, sellingPrice: productVariants.sellingPrice, purchaseAccountId: products.purchaseAccountId, salesAccountId: products.salesAccountId,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.tenantId, ctx.tenantId), eq(products.isActive, true), eq(productVariants.isActive, true),
      stockType && stockType !== 'all' ? eq(products.stockType, stockType) : undefined,
      term ? or(ilike(products.name, `%${term}%`), ilike(productVariants.name, `%${term}%`), ilike(productVariants.sku, `%${term}%`), ilike(productVariants.barcode, `%${term}%`)) : undefined))
    .orderBy(asc(products.name)).limit(40);
  return rows.map((r) => ({ ...r, purchasePrice: Number(r.purchasePrice), sellingPrice: Number(r.sellingPrice), stock: 0 }));
}

export async function getProduct(ctx: Ctx, id: string) {
  const [p] = await db.select().from(products).where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, id)));
  if (!p) throw notFound('Product');
  const [variants, cats] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.createdAt)),
    db.select({ categoryId: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, id)),
  ]);
  return { ...num(p), variants: variants.map(numV), categoryIds: cats.map((c) => c.categoryId) };
}

export async function saveProduct(ctx: Ctx, input: ProductInput, id?: string) {
  const pid = await db.transaction(async (tx) => {
    const row = {
      productType: input.productType, stockType: input.stockType, stockStatus: input.stockStatus, name: input.name, unitId: input.unitId ?? null,
      hsnSac: input.hsnSac ?? null, shortDescription: input.shortDescription ?? null, details: input.details ?? null,
      purchaseEnabled: input.purchaseEnabled, purchaseAccountId: input.purchaseAccountId ?? null, purchasePrice: String(input.purchasePrice),
      salesEnabled: input.salesEnabled, salesAccountId: input.salesAccountId ?? null, salesPrice: String(input.salesPrice),
      currencyId: input.currencyId, mrp: input.mrp != null ? String(input.mrp) : null, taxRateId: input.taxRateId ?? null,
      inventoryTracked: input.productType === 'service' ? false : input.inventoryTracked, trackingType: input.trackingType, custom: input.custom, isActive: input.isActive,
    };
    let productId = id;
    if (id) {
      const [u] = await tx.update(products).set({ ...row, updatedAt: new Date() }).where(and(eq(products.tenantId, ctx.tenantId), eq(products.id, id))).returning({ id: products.id });
      if (!u) throw notFound('Product');
      await tx.delete(productCategories).where(eq(productCategories.productId, id));
    } else {
      const serialNo = input.serialNo ?? (await nextCounter(tx, ctx.tenantId, 'product_serial'));
      const [p] = await tx.insert(products).values({ ...row, tenantId: ctx.tenantId, serialNo }).returning({ id: products.id });
      productId = p!.id;
    }
    if (input.categoryIds.length) await tx.insert(productCategories).values(input.categoryIds.map((categoryId) => ({ productId: productId!, categoryId })));
    await syncVariants(tx, ctx, productId!, input);
    return productId!;
  });
  return getProduct(ctx, pid);
}

/** Upsert variants by id; a product with no variants gets one default variant (stock lives on variants). */
async function syncVariants(tx: Tx, ctx: Ctx, productId: string, input: ProductInput) {
  const existing = await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId));
  const keep = new Set(input.variants.map((v) => v.id).filter(Boolean));
  const toDelete = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (toDelete.length) await tx.delete(productVariants).where(inArray(productVariants.id, toDelete));

  const list = input.variants.length ? input.variants : [{ name: input.name, purchasePrice: input.purchasePrice, sellingPrice: input.salesPrice, stockReminder: 0, custom: {}, isActive: true }];
  for (const v of list) {
    const base = { name: v.name, barcode: v.barcode ?? null, purchasePrice: String(v.purchasePrice), sellingPrice: String(v.sellingPrice), stockReminder: String(v.stockReminder),
      category: v.category ?? null, custom: v.custom ?? {}, isActive: v.isActive ?? true };
    if ('id' in v && v.id) {
      await tx.update(productVariants).set({ ...base, ...(v.sku ? { sku: v.sku } : {}), updatedAt: new Date() }).where(eq(productVariants.id, v.id));
    } else {
      const sku = ('sku' in v && v.sku) || `SKU-${String(await nextCounter(tx, ctx.tenantId, 'sku')).padStart(5, '0')}`;
      await tx.insert(productVariants).values({ ...base, sku, tenantId: ctx.tenantId, productId });
    }
  }
}

const num = (p: typeof products.$inferSelect) => ({ ...p, purchasePrice: Number(p.purchasePrice), salesPrice: Number(p.salesPrice), mrp: p.mrp == null ? null : Number(p.mrp) });
const numV = (v: typeof productVariants.$inferSelect) => ({ ...v, purchasePrice: Number(v.purchasePrice), sellingPrice: Number(v.sellingPrice), stockReminder: Number(v.stockReminder), stock: 0, avgRate: 0 });
