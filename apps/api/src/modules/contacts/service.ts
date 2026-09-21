import { and, asc, eq, inArray, or, ilike } from 'drizzle-orm';
import type { ContactInput, ListQuery } from '@erp/shared';
import { db } from '../../db/client';
import { contactPersons, contactShippingAddresses, contacts } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { buildListQuery, countRows } from '../../lib/list-query';
import { nextCounter } from '../../lib/counters';
import type { Ctx } from '../../lib/context';

const cols = { displayName: contacts.displayName, type: contacts.type, email: contacts.email, mobile: contacts.mobile, serialNo: contacts.serialNo, createdAt: contacts.createdAt, firmId: contacts.firmId, isActive: contacts.isActive };

export async function listContacts(ctx: Ctx, q: ListQuery) {
  const { where, orderBy, limit, offset } = buildListQuery(contacts, q, { searchable: [contacts.displayName, contacts.email, contacts.mobile, contacts.gstin], columns: cols, defaultSort: '-createdAt' });
  const scope = and(eq(contacts.tenantId, ctx.tenantId), where);
  const [rows, cnt] = await Promise.all([
    db.select({ id: contacts.id, serialNo: contacts.serialNo, displayName: contacts.displayName, primaryContactPerson: contacts.primaryContactPerson, type: contacts.type, email: contacts.email, mobile: contacts.mobile, firmId: contacts.firmId, isActive: contacts.isActive, createdAt: contacts.createdAt })
      .from(contacts).where(scope).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: countRows.as('total') }).from(contacts).where(scope),
  ]);
  return { rows, total: cnt[0]?.total ?? 0, page: q.page, pageSize: q.pageSize };
}

/** Lightweight lookup for dropdowns: "81-CORI ZUCKERMAN". */
export async function searchContacts(ctx: Ctx, type: 'customer' | 'vendor' | 'broker' | 'all', term?: string) {
  const typeFilter = type === 'customer' ? inArray(contacts.type, ['customer', 'both'])
    : type === 'vendor' ? inArray(contacts.type, ['vendor', 'both'])
    : type === 'broker' ? eq(contacts.type, 'broker') : undefined;
  const rows = await db.select({ id: contacts.id, serialNo: contacts.serialNo, displayName: contacts.displayName, discountType: contacts.discountType, discountValue: contacts.discountValue, paymentTermsId: contacts.paymentTermsId, customDueDays: contacts.customDueDays, gstTreatment: contacts.gstTreatment, billStateId: contacts.billStateId })
    .from(contacts)
    .where(and(eq(contacts.tenantId, ctx.tenantId), eq(contacts.isActive, true), typeFilter,
      term ? or(ilike(contacts.displayName, `%${term}%`), ilike(contacts.primaryContactPerson, `%${term}%`)) : undefined))
    .orderBy(asc(contacts.displayName)).limit(30);
  return rows.map((r) => ({ ...r, label: `${r.serialNo}-${r.displayName}` }));
}

export async function getContact(ctx: Ctx, id: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.tenantId, ctx.tenantId), eq(contacts.id, id)));
  if (!c) throw notFound('Contact');
  const [shipping, persons] = await Promise.all([
    db.select().from(contactShippingAddresses).where(eq(contactShippingAddresses.contactId, id)).orderBy(asc(contactShippingAddresses.sortOrder)),
    db.select().from(contactPersons).where(eq(contactPersons.contactId, id)).orderBy(asc(contactPersons.sortOrder)),
  ]);
  return toApi(c, shipping, persons);
}

export async function saveContact(ctx: Ctx, input: ContactInput, id?: string) {
  return db.transaction(async (tx) => {
    const row = toRow(input);
    let contactId = id;
    if (id) {
      const [u] = await tx.update(contacts).set({ ...row, updatedAt: new Date() }).where(and(eq(contacts.tenantId, ctx.tenantId), eq(contacts.id, id))).returning({ id: contacts.id });
      if (!u) throw notFound('Contact');
      await tx.delete(contactShippingAddresses).where(eq(contactShippingAddresses.contactId, id));
      await tx.delete(contactPersons).where(eq(contactPersons.contactId, id));
    } else {
      const serialNo = input.serialNo ?? (await nextCounter(tx, ctx.tenantId, 'contact_serial'));
      const [c] = await tx.insert(contacts).values({ ...row, tenantId: ctx.tenantId, serialNo }).returning({ id: contacts.id });
      contactId = c!.id;
    }
    if (input.shippingAddresses.length) {
      await tx.insert(contactShippingAddresses).values(input.shippingAddresses.map((s, i) => ({
        contactId: contactId!, address: s.address ?? null, companyName: s.companyName ?? null, mobile: s.mobile ?? null, gstin: s.gstin ?? null,
        countryId: s.countryId ?? null, stateId: s.stateId ?? null, cityId: s.cityId ?? null, areaId: s.areaId ?? null, pincode: s.pincode ?? null, mapUrl: s.mapUrl ?? null, sortOrder: i,
      })));
    }
    if (input.persons.length) {
      await tx.insert(contactPersons).values(input.persons.map((p, i) => ({
        contactId: contactId!, name: p.name, mobile: p.mobile ?? null, isWhatsapp: p.isWhatsapp, email: p.email || null, designation: p.designation ?? null, notes: p.notes ?? null, sortOrder: i,
      })));
    }
    return contactId!;
  }).then((cid) => getContact(ctx, cid));
}

/** Next serial shown in the form before saving (not reserved). */
export async function peekSerial(ctx: Ctx) {
  const [r] = await db.select({ serialNo: contacts.serialNo }).from(contacts).where(eq(contacts.tenantId, ctx.tenantId)).orderBy(contacts.serialNo).limit(1);
  void r;
  const [m] = await db.execute<{ max: number | null }>(
    (await import('drizzle-orm')).sql`select max(serial_no)::int as max from contacts where tenant_id = ${ctx.tenantId}`,
  ).then((res) => res.rows);
  return (m?.max ?? 0) + 1;
}

function toRow(i: ContactInput) {
  const b = i.billing;
  return {
    firmId: i.firmId, type: i.type, displayName: i.displayName, primaryContactPerson: i.primaryContactPerson ?? null,
    mobile: i.mobile ?? null, email: i.email || null, gstTreatment: i.gstTreatment, gstin: i.gstin ?? null, pan: i.pan ?? null,
    billAddress: b.address ?? null, billCountryId: b.countryId ?? null, billStateId: b.stateId ?? null, billCityId: b.cityId ?? null, billAreaId: b.areaId ?? null,
    billPincode: b.pincode ?? null, billMapUrl: b.mapUrl ?? null, billLat: b.latitude ?? null, billLng: b.longitude ?? null,
    bankName: i.bank.bankName ?? null, bankAccountNo: i.bank.accountNo ?? null, bankBranch: i.bank.branch ?? null, bankIfsc: i.bank.ifsc ?? null, bankSwift: i.bank.swift ?? null,
    dob: i.dob ?? null, salesPersonId: i.salesPersonId ?? null, referenceId: i.referenceId ?? null, brokerId: i.brokerId ?? null,
    discountType: i.discountType, discountValue: String(i.discountValue), paymentTermsId: i.paymentTermsId ?? null, customDueDays: i.customDueDays ?? null,
    creditLimitCurrencyId: i.creditLimitCurrencyId ?? null, creditLimitAmount: i.creditLimitAmount != null ? String(i.creditLimitAmount) : null,
    defaultTdsRate: i.defaultTdsRate != null ? String(i.defaultTdsRate) : null, defaultTcsRate: i.defaultTcsRate != null ? String(i.defaultTcsRate) : null,
    defaultRateTemplateId: i.defaultRateTemplateId ?? null, remark: i.remark ?? null, custom: i.custom, isActive: i.isActive,
  };
}

function toApi(c: typeof contacts.$inferSelect, shipping: (typeof contactShippingAddresses.$inferSelect)[], persons: (typeof contactPersons.$inferSelect)[]) {
  const { billAddress, billCountryId, billStateId, billCityId, billAreaId, billPincode, billMapUrl, billLat, billLng,
    bankName, bankAccountNo, bankBranch, bankIfsc, bankSwift, ...rest } = c;
  return {
    ...rest,
    discountValue: Number(rest.discountValue), creditLimitAmount: rest.creditLimitAmount == null ? null : Number(rest.creditLimitAmount),
    defaultTdsRate: rest.defaultTdsRate == null ? null : Number(rest.defaultTdsRate), defaultTcsRate: rest.defaultTcsRate == null ? null : Number(rest.defaultTcsRate),
    billing: { address: billAddress, countryId: billCountryId, stateId: billStateId, cityId: billCityId, areaId: billAreaId, pincode: billPincode, mapUrl: billMapUrl, latitude: billLat, longitude: billLng },
    bank: { bankName, accountNo: bankAccountNo, branch: bankBranch, ifsc: bankIfsc, swift: bankSwift },
    shippingAddresses: shipping, persons,
  };
}
