import { z } from 'zod';
import { uuid } from './common.js';

export const contactTypes = ['customer', 'vendor', 'both', 'broker'] as const;
export const gstTreatments = ['registered_regular', 'registered_composition', 'unregistered', 'consumer', 'overseas', 'sez', 'deemed_export'] as const;
export const discountTypes = ['flat', 'percent'] as const;

const address = z.object({
  address: z.string().max(500).optional().nullable(),
  countryId: uuid.optional().nullable(),
  stateId: uuid.optional().nullable(),
  cityId: uuid.optional().nullable(),
  areaId: uuid.optional().nullable(),
  pincode: z.string().max(12).optional().nullable(),
  mapUrl: z.string().max(500).optional().nullable(),
});

export const shippingAddressSchema = address.extend({
  id: uuid.optional(),
  companyName: z.string().max(150).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  gstin: z.string().max(20).optional().nullable(),
});

export const contactPersonSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(120),
  mobile: z.string().max(20).optional().nullable(),
  isWhatsapp: z.boolean().default(false),
  email: z.string().email().optional().nullable().or(z.literal('')),
  designation: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const contactSchema = z.object({
  firmId: uuid,
  type: z.enum(contactTypes),
  displayName: z.string().min(1).max(150),
  primaryContactPerson: z.string().max(120).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  serialNo: z.number().int().positive().optional(),
  gstTreatment: z.enum(gstTreatments),
  gstin: z.string().max(20).optional().nullable(),
  pan: z.string().max(20).optional().nullable(),
  // billing
  billing: address.extend({ latitude: z.number().optional().nullable(), longitude: z.number().optional().nullable() }).default({}),
  shippingAddresses: z.array(shippingAddressSchema).default([]),
  // bank
  bank: z.object({
    bankName: z.string().max(100).optional().nullable(), accountNo: z.string().max(40).optional().nullable(),
    branch: z.string().max(100).optional().nullable(), ifsc: z.string().max(20).optional().nullable(), swift: z.string().max(20).optional().nullable(),
  }).default({}),
  persons: z.array(contactPersonSchema).default([]),
  // other
  dob: z.string().date().optional().nullable(),
  salesPersonId: uuid.optional().nullable(),
  referenceId: uuid.optional().nullable(),
  brokerId: uuid.optional().nullable(),
  discountType: z.enum(discountTypes).default('flat'),
  discountValue: z.number().min(0).default(0),
  paymentTermsId: uuid.optional().nullable(),
  customDueDays: z.number().int().min(0).optional().nullable(),
  creditLimitCurrencyId: uuid.optional().nullable(),
  creditLimitAmount: z.number().min(0).optional().nullable(),
  defaultTdsRate: z.number().min(0).max(100).optional().nullable(),
  defaultTcsRate: z.number().min(0).max(100).optional().nullable(),
  defaultRateTemplateId: uuid.optional().nullable(),
  remark: z.string().max(1000).optional().nullable(),
  custom: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});
export type ContactInput = z.infer<typeof contactSchema>;
