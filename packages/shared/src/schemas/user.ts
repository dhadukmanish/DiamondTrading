import { z } from 'zod'

import { USER_STATUSES } from '../constants'
import {
  emailSchema,
  listQuerySchema,
  passwordSchema,
  phoneSchema,
  timestampsSchema,
  uuidSchema,
} from './common'
import { roleAssignmentInputSchema, roleAssignmentSchema } from './role'

export const userStatusSchema = z.enum(USER_STATUSES)

export const userSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema.nullable(),
    email: z.string(),
    fullName: z.string(),
    phone: z.string().nullable(),
    status: userStatusSchema,
    isTenantOwner: z.boolean(),
    lastLoginAt: z.string().datetime().nullable(),
    assignments: z.array(roleAssignmentSchema),
  })
  .merge(timestampsSchema)
export type User = z.infer<typeof userSchema>

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema.optional(),
  /**
   * Omit to create the user in `invited` state with no usable password; they
   * must go through a password-set flow before they can sign in.
   */
  password: passwordSchema.optional(),
  assignments: z.array(roleAssignmentInputSchema).default([]),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  phone: phoneSchema.nullish(),
  status: userStatusSchema.optional(),
})
export type UpdateUserInput = z.infer<typeof updateUserSchema>

/** Replaces a user's full set of scoped role assignments. */
export const setUserAssignmentsSchema = z.object({
  assignments: z.array(roleAssignmentInputSchema),
})
export type SetUserAssignmentsInput = z.infer<typeof setUserAssignmentsSchema>

export const listUserQuerySchema = listQuerySchema.extend({
  firmId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  userStatus: userStatusSchema.optional(),
})
export type ListUserQuery = z.infer<typeof listUserQuerySchema>
