import { z } from 'zod';
import { uuid } from './common.js';

export const currencySchema = z.object({
  code: z.string().length(3).toUpperCase(),
  name: z.string().min(1).max(60),
  symbol: z.string().min(1).max(5),
  decimals: z.number().int().min(0).max(4).default(2),
  isActive: z.boolean().default(true),
});

export const unitSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(60),
  decimals: z.number().int().min(0).max(4).default(2),
  isActive: z.boolean().default(true),
});

export const taxRateSchema = z.object({
  name: z.string().min(1).max(60),          // "GST 3%"
  rate: z.number().min(0).max(100),
  type: z.enum(['gst', 'out_of_scope', 'exempt', 'nil']).default('gst'),
  isActive: z.boolean().default(true),
});

export const categorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: uuid.optional().nullable(),
  isActive: z.boolean().default(true),
});

export const paymentTermSchema = z.object({
  name: z.string().min(1).max(60),
  days: z.number().int().min(0).default(0),
  isDefault: z.boolean().default(false),
});

export const salesPersonSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  userId: uuid.optional().nullable(),
  isActive: z.boolean().default(true),
});

export const locationKinds = ['country', 'state', 'city', 'area'] as const;
export const locationSchema = z.object({
  kind: z.enum(locationKinds),
  name: z.string().min(1).max(120),
  code: z.string().max(10).optional().nullable(),   // ISO / GST state code
  parentId: uuid.optional().nullable(),
});
