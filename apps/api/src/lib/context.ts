import type { FastifyRequest } from 'fastify'

import { requireTenantId } from '../plugins/auth'
import { unauthenticated } from './errors'

/**
 * Everything a service needs to know about who is making a change and where it
 * belongs. Built once per request and threaded through to the audit trail.
 */
export interface ActorContext {
  tenantId: string
  actorId: string
  ipAddress?: string | null
  userAgent?: string | null
}

export function actorContext(request: FastifyRequest): ActorContext {
  if (!request.auth) throw unauthenticated()

  return {
    tenantId: requireTenantId(request),
    actorId: request.auth.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  }
}

/**
 * The same context for operations that sit above the tenant hierarchy (tenant
 * administration by a platform operator), where there is no tenant to scope to.
 */
export type PlatformActorContext = Omit<ActorContext, 'tenantId'>

export function platformActorContext(request: FastifyRequest): PlatformActorContext {
  if (!request.auth) throw unauthenticated()

  return {
    actorId: request.auth.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  }
}
