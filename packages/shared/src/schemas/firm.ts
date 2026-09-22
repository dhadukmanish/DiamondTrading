import { z } from 'zod'

import {
  addressSchema,
  codeSchema,
  emailSchema,
  entityStatusSchema,
  phoneSchema,
  timestampsSchema,
  uuidSchema,
} from './common'

/** Indian GSTIN: 2-digit state code, 10-char PAN, entity digit, Z, checksum. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Enter a valid GSTIN')

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN')

export const firmSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    name: z.string(),
    legalName: z.string().nullable(),
    code: z.string(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    baseCurrency: z.string(),
    address: addressSchema.nullable(),
    status: entityStatusSchema,
  })
  .merge(timestampsSchema)
export type Firm = z.infer<typeof firmSchema>

export const createFirmSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(200).optional(),
  /** Unique per tenant. */
  code: codeSchema,
  gstin: gstinSchema.optional(),
  pan: panSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('INR'),
  address: addressSchema.optional(),
})
export type CreateFirmInput = z.infer<typeof createFirmSchema>

export const updateFirmSchema = createFirmSchema
  .omit({ code: true })
  .partial()
  .extend({ status: entityStatusSchema.optional() })
export type UpdateFirmInput = z.infer<typeof updateFirmSchema>
