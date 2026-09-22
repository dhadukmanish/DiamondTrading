import { z } from 'zod'

import { BRANCH_TYPES } from '../constants'
import {
  addressSchema,
  codeSchema,
  emailSchema,
  entityStatusSchema,
  listQuerySchema,
  phoneSchema,
  timestampsSchema,
  uuidSchema,
} from './common'

export const branchTypeSchema = z.enum(BRANCH_TYPES)

export const branchSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    firmId: uuidSchema,
    name: z.string(),
    code: z.string(),
    type: branchTypeSchema,
    isHeadOffice: z.boolean(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    address: addressSchema.nullable(),
    status: entityStatusSchema,
  })
  .merge(timestampsSchema)
export type Branch = z.infer<typeof branchSchema>

export const createBranchSchema = z.object({
  firmId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  /** Unique per firm. */
  code: codeSchema,
  type: branchTypeSchema.default('office'),
  isHeadOffice: z.boolean().default(false),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: addressSchema.optional(),
})
export type CreateBranchInput = z.infer<typeof createBranchSchema>

export const updateBranchSchema = createBranchSchema
  .omit({ code: true, firmId: true })
  .partial()
  .extend({ status: entityStatusSchema.optional() })
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>

/** Branches can additionally be filtered to a single firm. */
export const listBranchQuerySchema = listQuerySchema.extend({
  firmId: uuidSchema.optional(),
  type: branchTypeSchema.optional(),
})
export type ListBranchQuery = z.infer<typeof listBranchQuerySchema>
