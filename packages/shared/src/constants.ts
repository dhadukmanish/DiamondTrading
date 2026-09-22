export const APP_NAME = 'DiamondTrading'

/** All versioned API routes are mounted under this prefix. */
export const API_PREFIX = '/api/v1'

export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 25,
  maxPageSize: 100,
} as const

/** Name of the httpOnly cookie carrying the refresh token. */
export const REFRESH_TOKEN_COOKIE = 'dt_refresh_token'

/**
 * Optional request header used to pin a request to a firm / branch when the
 * caller has access to more than one. The server always re-validates that the
 * authenticated user is actually assigned to the requested scope.
 */
export const FIRM_CONTEXT_HEADER = 'x-firm-id'
export const BRANCH_CONTEXT_HEADER = 'x-branch-id'

/**
 * Platform (super admin) accounts have no tenant of their own, so they name the
 * tenant they are operating on with this header. It is ignored for everyone
 * else, whose tenant always comes from their own record.
 */
export const TENANT_CONTEXT_HEADER = 'x-tenant-id'

export const ENTITY_STATUSES = ['active', 'inactive', 'suspended'] as const
export type EntityStatus = (typeof ENTITY_STATUSES)[number]

export const USER_STATUSES = ['invited', 'active', 'inactive', 'suspended'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const TENANT_STATUSES = ['trial', 'active', 'suspended', 'cancelled'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

export const BRANCH_TYPES = ['head_office', 'office', 'factory', 'warehouse', 'showroom'] as const
export type BranchType = (typeof BRANCH_TYPES)[number]
