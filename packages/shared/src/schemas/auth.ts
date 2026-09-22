import { z } from 'zod'

import { emailSchema, passwordSchema, slugSchema, uuidSchema } from './common'
import { roleAssignmentSchema } from './role'

export const loginSchema = z.object({
  email: emailSchema,
  /** Not run through `passwordSchema`: policy applies when setting, not verifying. */
  password: z.string().min(1).max(128),
  /**
   * Required only when the same email exists in more than one tenant. Platform
   * (super admin) accounts sign in without a tenant slug.
   */
  tenantSlug: slugSchema.optional(),
})
export type LoginInput = z.infer<typeof loginSchema>

/**
 * The authenticated principal, with `permissions` already expanded (every
 * `<module>:manage` grant resolved into concrete actions).
 */
export const authUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string(),
  tenantId: uuidSchema.nullable(),
  tenantSlug: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  isTenantOwner: z.boolean(),
  permissions: z.array(z.string()),
  assignments: z.array(roleAssignmentSchema),
  /** Firms and branches the principal can act on; empty means tenant-wide. */
  firmIds: z.array(uuidSchema),
  branchIds: z.array(uuidSchema),
})
export type AuthUser = z.infer<typeof authUserSchema>

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  /** Access-token lifetime in seconds. */
  expiresIn: z.number().int(),
  user: authUserSchema,
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

export const refreshResponseSchema = loginResponseSchema
export type RefreshResponse = z.infer<typeof refreshResponseSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current password',
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/**
 * Claims embedded in the access token. Kept small: only what is needed to
 * re-establish tenant context. Permissions are re-read per request so a
 * revoked grant takes effect immediately.
 */
export const accessTokenClaimsSchema = z.object({
  sub: uuidSchema,
  tenantId: uuidSchema.nullable(),
  isSuperAdmin: z.boolean(),
})
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>

export const refreshTokenClaimsSchema = z.object({
  sub: uuidSchema,
  /** Id of the `refresh_tokens` row, so a single session can be revoked. */
  sid: uuidSchema,
})
export type RefreshTokenClaims = z.infer<typeof refreshTokenClaimsSchema>
