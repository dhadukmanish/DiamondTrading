import { z } from 'zod';

export const uuid = z.string().uuid();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional(),
  sort: z.string().optional(),          // "field" or "-field"
  filters: z.string().optional(),       // JSON: [{field,op,value}]
  firmId: uuid.optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const filterOps = ['eq', 'ne', 'contains', 'starts', 'gt', 'gte', 'lt', 'lte', 'in', 'between', 'isnull', 'notnull'] as const;
export type FilterOp = (typeof filterOps)[number];
export const filterSchema = z.object({
  field: z.string(),
  op: z.enum(filterOps),
  value: z.unknown().optional(),
});
export type Filter = z.infer<typeof filterSchema>;

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const idParam = z.object({ id: uuid });
