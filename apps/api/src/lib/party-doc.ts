import { and, eq, inArray } from 'drizzle-orm';
import { calcLine, calcTotals, splitGst, type TransactionLineInput, type Totals } from '@erp/shared';
import { db, type Tx } from '../db/client';
import { branches, contacts, firms, locations, paymentTerms, productVariants, products, taxRates } from '../db/schema';
import { badRequest } from './errors';
import type { JournalLineInput } from './ledger/journal';

export interface ResolvedLine extends TransactionLineInput {
  taxRatePct: number; taxKind: string; productType: string; inventoryTracked: boolean; stockType: string;
  purchaseAccountId: string | null; salesAccountId: string | null;
  gross: number; discount: number; taxable: number; tax: number; amount: number;
}

/**
 * Enriches lines with product/tax data and computes money; also decides interstate
 * (firm state vs contact billing state) for the GST split.
 */
export async function resolveLines(tx: Tx, tenantId: string, input: {
  firmId: string; branchId: string; contactId: string; taxType: 'exclusive' | 'inclusive'; items: TransactionLineInput[];
  withholdingType: 'none' | 'tds' | 'tcs'; withholdingRate: number; adjustment: number; shippingCharges?: number; roundOff?: boolean;
}) {
  const variantIds = [...new Set(input.items.map((i) => i.variantId))];
  const taxIds = [...new Set(input.items.map((i) => i.taxRateId).filter(Boolean))] as string[];
  const [vars, taxes, [firm], [branch], [contact]] = await Promise.all([
    tx.select({ id: productVariants.id, productType: products.productType, inventoryTracked: products.inventoryTracked, stockType: products.stockType, purchaseAccountId: products.purchaseAccountId, salesAccountId: products.salesAccountId, hsnSac: products.hsnSac, unitId: products.unitId })
      .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(and(eq(products.tenantId, tenantId), inArray(productVariants.id, variantIds))),
    taxIds.length ? tx.select().from(taxRates).where(inArray(taxRates.id, taxIds)) : Promise.resolve([]),
    tx.select({ stateCode: firms.stateCode, gst: firms.gstApplicable }).from(firms).where(eq(firms.id, input.firmId)),
    tx.select({ stateCode: branches.stateCode }).from(branches).where(eq(branches.id, input.branchId)),
    tx.select({ stateId: contacts.billStateId, gstTreatment: contacts.gstTreatment }).from(contacts).where(eq(contacts.id, input.contactId)),
  ]);
  if (!contact) throw badRequest('Contact not found');
  const contactState = contact.stateId ? (await tx.select({ code: locations.code }).from(locations).where(eq(locations.id, contact.stateId)))[0]?.code ?? null : null;
  const firmState = branch?.stateCode ?? firm?.stateCode ?? null;
  const interstate = contact.gstTreatment === 'overseas' || contact.gstTreatment === 'sez' || (!!contactState && !!firmState && contactState !== firmState);

  const lines: ResolvedLine[] = input.items.map((it) => {
    const v = vars.find((x) => x.id === it.variantId);
    if (!v) throw badRequest('Product not found for a line');
    const t = taxes.find((x) => x.id === it.taxRateId);
    const taxRatePct = t && t.type === 'gst' ? Number(t.rate) : 0;
    const m = calcLine({ qty: it.qty, rate: it.rate, discountType: it.discountType, discountValue: it.discountValue, taxRatePct }, input.taxType);
    return { ...it, hsnSac: it.hsnSac ?? v.hsnSac, unitId: it.unitId ?? v.unitId, taxRatePct, taxKind: t?.type ?? 'none', productType: v.productType, inventoryTracked: v.inventoryTracked, stockType: v.stockType, purchaseAccountId: v.purchaseAccountId, salesAccountId: v.salesAccountId, ...m };
  });
  const totals = calcTotals({ lines, withholdingType: input.withholdingType, withholdingRate: input.withholdingRate, adjustment: input.adjustment, shippingCharges: input.shippingCharges, roundOff: input.roundOff });
  return { lines, totals, interstate, placeOfSupply: contactState ?? firmState };
}

/** Header numeric columns from computed totals (strings for numeric columns). */
export function totalsToRow(t: Totals, interstate: boolean, placeOfSupply: string | null) {
  return {
    subtotal: String(t.subtotal), taxableTotal: String(t.taxableTotal), taxTotal: String(t.taxTotal), discountTotal: String(t.discountTotal),
    withholdingAmount: String(t.withholding), adjustment: String(t.adjustment), roundOff: String(t.roundOff), grandTotal: String(t.grandTotal), interstate, placeOfSupply,
  };
}

export function lineToRow(l: ResolvedLine, i: number) {
  return {
    variantId: l.variantId, description: l.description ?? null, hsnSac: l.hsnSac ?? null, unitId: l.unitId ?? null, pcs: l.pcs, qty: String(l.qty), rate: String(l.rate),
    discountType: l.discountType, discountValue: String(l.discountValue), taxRateId: l.taxRateId ?? null, taxRatePct: String(l.taxRatePct), accountId: l.accountId ?? null,
    gross: String(l.gross), discount: String(l.discount), taxable: String(l.taxable), tax: String(l.tax), amount: String(l.amount), sortOrder: i,
  };
}

/** Input GST lines (purchase side, debit) or output (sales side, credit). */
export function gstLines(tax: number, interstate: boolean, side: 'input' | 'output'): JournalLineInput[] {
  const { cgst, sgst, igst } = splitGst(tax, interstate);
  const k = side === 'input' ? 'debit' : 'credit';
  return [{ systemKey: `${side}_cgst`, [k]: cgst }, { systemKey: `${side}_sgst`, [k]: sgst }, { systemKey: `${side}_igst`, [k]: igst }];
}

/** Due date from payment terms (or contact's custom days). */
export async function dueDateFor(tx: Tx, date: string, paymentTermsId?: string | null, contactId?: string) {
  let days = 0;
  if (paymentTermsId) { const [t] = await tx.select({ days: paymentTerms.days }).from(paymentTerms).where(eq(paymentTerms.id, paymentTermsId)); days = t?.days ?? 0; }
  else if (contactId) { const [c] = await tx.select({ d: contacts.customDueDays }).from(contacts).where(eq(contacts.id, contactId)); days = c?.d ?? 0; }
  const d = new Date(date); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Decorates document rows with contact / variant names for lists and detail views. */
export async function decorate<T extends { contactId: string }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.contactId))];
  const cs = ids.length ? await db.select({ id: contacts.id, name: contacts.displayName, person: contacts.primaryContactPerson }).from(contacts).where(inArray(contacts.id, ids)) : [];
  return rows.map((r) => { const c = cs.find((x) => x.id === r.contactId); return { ...r, contactName: c ? (c.person ? `${c.name} - ${c.person}` : c.name) : '' }; });
}
