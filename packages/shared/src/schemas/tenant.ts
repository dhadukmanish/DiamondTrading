import { z } from 'zod'

import { TENANT_STATUSES } from '../constants'
import { listQuerySchema, slugSchema, timestampsSchema, uuidSchema } from './common'

export const tenantStatusSchema = z.enum(TENANT_STATUSES)

export const tenantSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    slug: z.string(),
    status: tenantStatusSchema,
    timezone: z.string(),
    baseCurrency: z.string(),
  })
  .merge(timestampsSchema)
export type Tenant = z.infer<typeof tenantSchema>

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('INR'),
})
export type CreateTenantInput = z.infer<typeof createTenantSchema>

export const updateTenantSchema = createTenantSchema
  .omit({ slug: true })
  .partial()
  .extend({ status: tenantStatusSchema.optional() })
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>

/**
 * Tenants have their own lifecycle (`trial`/`cancelled`), so the generic
 * `status` filter on `listQuerySchema` does not apply to them.
 */
export const listTenantQuerySchema = listQuerySchema
  .omit({ status: true })
  .extend({ tenantStatus: tenantStatusSchema.optional() })
export type ListTenantQuery = z.infer<typeof listTenantQuerySchema>
