import { boolean, date, integer, jsonb, numeric, pgTable, text, uuid, varchar, index, uniqueIndex, doublePrecision } from 'drizzle-orm/pg-core';
import { baseColumns } from './_base';

export const contacts = pgTable('contacts', {
  ...baseColumns,
  tenantId: uuid('tenant_id').notNull(),
  firmId: uuid('firm_id').notNull(),
  serialNo: integer('serial_no').notNull(),
  type: varchar('type', { length: 10 }).notNull(),
  displayName: varchar('display_name', { length: 150 }).notNull(),
  primaryContactPerson: varchar('primary_contact_person', { length: 120 }),
  mobile: varchar('mobile', { length: 20 }),
  email: varchar('email', { length: 150 }),
  gstTreatment: varchar('gst_treatment', { length: 30 }).notNull(),
  gstin: varchar('gstin', { length: 20 }),
  pan: varchar('pan', { length: 20 }),
  // billing address (flat — one per contact)
  billAddress: text('bill_address'),
  billCountryId: uuid('bill_country_id'),
  billStateId: uuid('bill_state_id'),
  billCityId: uuid('bill_city_id'),
  billAreaId: uuid('bill_area_id'),
  billPincode: varchar('bill_pincode', { length: 12 }),
  billMapUrl: varchar('bill_map_url', { length: 500 }),
  billLat: doublePrecision('bill_lat'),
  billLng: doublePrecision('bill_lng'),
  // bank
  bankName: varchar('bank_name', { length: 100 }),
  bankAccountNo: varchar('bank_account_no', { length: 40 }),
  bankBranch: varchar('bank_branch', { length: 100 }),
  bankIfsc: varchar('bank_ifsc', { length: 20 }),
  bankSwift: varchar('bank_swift', { length: 20 }),
  // other
  dob: date('dob'),
  salesPersonId: uuid('sales_person_id'),
  referenceId: uuid('reference_id'),
  brokerId: uuid('broker_id'),
  discountType: varchar('discount_type', { length: 8 }).notNull().default('flat'),
  discountValue: numeric('discount_value', { precision: 14, scale: 2 }).notNull().default('0'),
  paymentTermsId: uuid('payment_terms_id'),
  customDueDays: integer('custom_due_days'),
  creditLimitCurrencyId: uuid('credit_limit_currency_id'),
  creditLimitAmount: numeric('credit_limit_amount', { precision: 16, scale: 2 }),
  defaultTdsRate: numeric('default_tds_rate', { precision: 6, scale: 3 }),
  defaultTcsRate: numeric('default_tcs_rate', { precision: 6, scale: 3 }),
  defaultRateTemplateId: uuid('default_rate_template_id'),
  remark: text('remark'),
  custom: jsonb('custom').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({
  uq: uniqueIndex('contacts_tenant_serial').on(t.tenantId, t.serialNo),
  ix: index('contacts_tenant_type_name').on(t.tenantId, t.type, t.displayName),
}));

export const contactShippingAddresses = pgTable('contact_shipping_addresses', {
  ...baseColumns,
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  address: text('address'),
  companyName: varchar('company_name', { length: 150 }),
  mobile: varchar('mobile', { length: 20 }),
  gstin: varchar('gstin', { length: 20 }),
  countryId: uuid('country_id'), stateId: uuid('state_id'), cityId: uuid('city_id'), areaId: uuid('area_id'),
  pincode: varchar('pincode', { length: 12 }),
  mapUrl: varchar('map_url', { length: 500 }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({ ix: index('ship_addr_contact').on(t.contactId) }));

export const contactPersons = pgTable('contact_persons', {
  ...baseColumns,
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  mobile: varchar('mobile', { length: 20 }),
  isWhatsapp: boolean('is_whatsapp').notNull().default(false),
  email: varchar('email', { length: 150 }),
  designation: varchar('designation', { length: 80 }),
  notes: varchar('notes', { length: 500 }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({ ix: index('persons_contact').on(t.contactId) }));
