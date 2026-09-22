import { z } from 'zod'

import { ENTITY_STATUSES, PAGINATION } from '../constants'

export const uuidSchema = z.string().uuid()

export const idParamSchema = z.object({ id: uuidSchema })
export type IdParam = z.infer<typeof idParamSchema>

/**
 * A short human-entered identifier (firm code, branch code, role slug).
 * Normalised to lower case so uniqueness is case-insensitive.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lower-case letters, digits, hyphen or underscore')

export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(16)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Use upper-case letters, digits, hyphen or underscore')

export const emailSchema = z.string().trim().toLowerCase().email().max(255)

export const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .regex(/^[+]?[0-9\s()-]+$/, 'Enter a valid phone number')

/**
 * Password policy for locally managed accounts. Length is the primary control;
 * the character-class requirement is deliberately light.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .regex(/[a-z]/, 'Include a lower-case letter')
  .regex(/[A-Z]/, 'Include an upper-case letter')
  .regex(/[0-9]/, 'Include a digit')

export const entityStatusSchema = z.enum(ENTITY_STATUSES)

export const addressSchema = z.object({
  line1: z.string().trim().max(200).optional(),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
})
export type Address = z.infer<typeof addressSchema>

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxPageSize)
    .default(PAGINATION.defaultPageSize),
})
export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const sortOrderSchema = z.enum(['asc', 'desc']).default('asc')

/** Query shape shared by every list endpoint. */
export const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  status: entityStatusSchema.optional(),
  sortOrder: sortOrderSchema,
})
export type ListQuery = z.infer<typeof listQuerySchema>

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
  hasPrevious: z.boolean(),
})
export type PaginationMeta = z.infer<typeof paginationMetaSchema>

/** Wraps a list payload as `{ data, meta }`. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: paginationMetaSchema,
  })
}

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
})
export type ErrorResponse = z.infer<typeof errorResponseSchema>

export const timestampsSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
