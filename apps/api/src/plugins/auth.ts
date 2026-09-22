import {
  accessTokenClaimsSchema,
  type AuthUser,
  BRANCH_CONTEXT_HEADER,
  FIRM_CONTEXT_HEADER,
  hasAllPermissions,
  type RequestScope,
  TENANT_CONTEXT_HEADER,
} from '@diamond/shared'
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import fp from 'fastify-plugin'

import { db } from '../db/index'
import { badRequest, forbidden, tenantInactive, tenantRequired, unauthenticated } from '../lib/errors'
import { canAccessBranch, canAccessFirm, loadIdentity } from '../modules/auth/identity.service'

/** Tenant lifecycle states whose users may still sign in and work. */
const USABLE_TENANT_STATUSES = new Set(['trial', 'active'])

declare module 'fastify' {
  interface FastifyInstance {
    /** Rejects the request unless it carries a valid access token. */
    authenticate: preHandlerHookHandler
    /** Rejects unless the principal holds every listed permission. */
    requirePermission(...codes: string[]): preHandlerHookHandler
    /** Rejects unless the principal holds a platform-scoped role. */
    requireSuperAdmin: preHandlerHookHandler
  }

  interface FastifyRequest {
    /** The authenticated principal, or null on anonymous routes. */
    auth: AuthUser | null
  }
}

function headerValue(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && value.trim().length > 0 ? value.trim() : null
}

/**
 * The tenant every query in this request must be scoped to.
 *
 * Ordinary users are pinned to their own tenant and cannot override it. Only
 * platform accounts, which have no tenant of their own, may name one with the
 * `x-tenant-id` header.
 */
export function requireTenantId(request: FastifyRequest): string {
  const auth = request.auth
  if (!auth) throw unauthenticated()
  if (auth.tenantId) return auth.tenantId

  const headerTenant = headerValue(request, TENANT_CONTEXT_HEADER)
  if (!headerTenant) throw tenantRequired()
  if (!auth.isSuperAdmin) throw forbidden('You are not assigned to a tenant')

  return headerTenant
}

/**
 * Resolves the optional firm / branch context headers, verifying that the
 * principal is actually allowed to act in the scope it asked for.
 */
export function requestScope(request: FastifyRequest): RequestScope {
  const auth = request.auth
  if (!auth) throw unauthenticated()

  const firmId = headerValue(request, FIRM_CONTEXT_HEADER)
  const branchId = headerValue(request, BRANCH_CONTEXT_HEADER)

  if (firmId && !canAccessFirm(auth, firmId)) {
    throw forbidden('You do not have access to that firm')
  }
  if (branchId) {
    if (!firmId) throw badRequest(`${BRANCH_CONTEXT_HEADER} requires ${FIRM_CONTEXT_HEADER}`)
    if (!canAccessBranch(auth, branchId, firmId)) {
      throw forbidden('You do not have access to that branch')
    }
  }

  return { tenantId: auth.tenantId, firmId, branchId }
}

export const authPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorateRequest('auth', null)

    const authenticate: preHandlerHookHandler = async (request) => {
      let claims: unknown
      try {
        claims = await request.accessVerify()
      } catch {
        // Expiry and tampering are deliberately reported the same way.
        throw unauthenticated('Invalid or expired access token')
      }

      const parsed = accessTokenClaimsSchema.safeParse(claims)
      if (!parsed.success) throw unauthenticated('Malformed access token')

      // Permissions are re-read per request, so revoking a role takes effect
      // immediately rather than at the next token refresh.
      const identity = await loadIdentity(db, parsed.data.sub)
      if (!identity) throw unauthenticated('This account is no longer active')

      if (identity.tenantStatus && !USABLE_TENANT_STATUSES.has(identity.tenantStatus)) {
        throw tenantInactive()
      }

      request.auth = identity.authUser
    }

    const requireSuperAdmin: preHandlerHookHandler = async (request) => {
      if (!request.auth) throw unauthenticated()
      if (!request.auth.isSuperAdmin) throw forbidden('Platform administrators only')
    }

    app.decorate('authenticate', authenticate)
    app.decorate('requireSuperAdmin', requireSuperAdmin)

    app.decorate('requirePermission', (...codes: string[]): preHandlerHookHandler => {
      return async (request) => {
        const auth = request.auth
        if (!auth) throw unauthenticated()
        // A platform role is unconditional; it is not expressed as grants.
        if (auth.isSuperAdmin) return
        if (!hasAllPermissions(auth.permissions, codes)) {
          throw forbidden()
        }
      }
    })
  },
  { name: 'auth', dependencies: ['jwt'] },
)
