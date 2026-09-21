import { z } from 'zod';
import { uuid } from './common.js';

export const customFieldTypes = ['text', 'number', 'date', 'dropdown', 'multiselect', 'boolean', 'url'] as const;

export const customFieldSchema = z.object({
  module: z.string().min(1).max(60),        // e.g. "certified_products"
  key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60),
  label: z.string().min(1).max(100),
  type: z.enum(customFieldTypes),
  required: z.boolean().default(false),
  showInList: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const customFieldOptionSchema = z.object({
  fieldId: uuid,
  value: z.string().min(1).max(100),
  displayValue: z.string().min(1).max(100),
  sortOrder: z.number().int().default(0),
});

export const customFieldOptionsBulkSchema = z.object({
  options: z.array(customFieldOptionSchema.omit({ fieldId: true })),
});
