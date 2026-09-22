import type { ApiErrorCode, ApiErrorDetail } from '@diamond/shared'

/**
 * An error that is safe to surface to the client. Anything else that reaches
 * the error handler is logged and reported as a generic INTERNAL_ERROR, so
 * internal details never leak into responses.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: ApiErrorCode
  readonly details?: ApiErrorDetail[]

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, details?: ApiErrorDetail[]): AppError =>
  new AppError(400, 'VALIDATION_ERROR', message, details)

export const unauthenticated = (message = 'Authentication required'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message)

export const invalidCredentials = (): AppError =>
  // Deliberately vague: never reveal whether the email exists.
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')

export const forbidden = (message = 'You do not have permission to perform this action'): AppError =>
  new AppError(403, 'FORBIDDEN', message)

export const notFound = (resource = 'Resource'): AppError =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`)

export const conflict = (message: string, details?: ApiErrorDetail[]): AppError =>
  new AppError(409, 'CONFLICT', message, details)

export const tenantRequired = (): AppError =>
  new AppError(400, 'TENANT_REQUIRED', 'A tenant context is required for this request')

export const tenantInactive = (): AppError =>
  new AppError(403, 'TENANT_INACTIVE', 'This tenant is not active')

export const internalError = (message = 'An unexpected error occurred'): AppError =>
  new AppError(500, 'INTERNAL_ERROR', message)

/** Postgres unique-violation SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'

export function isPostgresError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}
