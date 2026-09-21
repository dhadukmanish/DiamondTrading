import { z } from 'zod';
import { uuid } from './common.js';

export const dateFormats = ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'] as const;

export const firmSchema = z.object({
  name: z.string().min(1).max(150),
  legalName: z.string().max(200).optional().nullable(),
  gstin: z.string().max(20).optional().nullable(),
  pan: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  stateCode: z.string().max(5).optional().nullable(),
  countryId: uuid.optional().nullable(),
  baseCurrencyId: uuid,
  dateFormat: z.enum(dateFormats).default('DD-MM-YYYY'),
  fyStartMonth: z.number().int().min(1).max(12).default(4),
  gstApplicable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type FirmInput = z.infer<typeof firmSchema>;

export const branchSchema = z.object({
  firmId: uuid,
  name: z.string().min(1).max(150),
  code: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  stateCode: z.string().max(5).optional().nullable(),
  defaultCurrencyId: uuid.optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type BranchInput = z.infer<typeof branchSchema>;

export const userSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  phone: z.string().max(30).optional().nullable(),
  roleIds: z.array(uuid).default([]),
  firmIds: z.array(uuid).default([]),   // empty = all firms
  defaultFirmId: uuid.optional().nullable(),
  isActive: z.boolean().default(true),
});
export type UserInput = z.infer<typeof userSchema>;

export const roleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string()).default([]),
});
export type RoleInput = z.infer<typeof roleSchema>;
