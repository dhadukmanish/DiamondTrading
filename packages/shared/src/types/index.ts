import type { PaginationMeta } from '../schemas/common'

/** Standard list envelope returned by every collection endpoint. */
export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

/** Machine-readable error codes. The HTTP status is carried separately. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'TENANT_REQUIRED',
  'TENANT_INACTIVE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export interface ApiErrorDetail {
  path: string
  message: string
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | string
    message: string
    details?: ApiErrorDetail[]
  }
}

/**
 * The tenant / firm / branch a request is executing against. Resolved once per
 * request from the access token plus the optional context headers, then used to
 * scope every query.
 */
export interface RequestScope {
  tenantId: string | null
  firmId: string | null
  branchId: string | null
}
