import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { corsOrigins, env, isProduction } from '../config/env'

/**
 * Transport-level hardening: CORS, security headers, signed cookies and a
 * blanket rate limit. Registered before any route so it covers all of them.
 */
export const securityPlugin = fp(
  async (app: FastifyInstance) => {
    await app.register(helmet, {
      // This process only serves JSON; a CSP would apply to nothing and the
      // default one blocks the Swagger-style browsers used in development.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    })

    await app.register(cors, {
      origin: corsOrigins,
      // The refresh token travels in an httpOnly cookie, so the browser must be
      // allowed to send credentials cross-origin (web dev server -> API).
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    })

    await app.register(cookie, {
      secret: env.COOKIE_SECRET,
      parseOptions: {
        httpOnly: true,
        sameSite: isProduction ? 'strict' : 'lax',
        secure: env.COOKIE_SECURE,
        path: '/',
        ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
      },
    })

    await app.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
      // Key on the authenticated user where possible so several people behind
      // one office NAT do not share a bucket.
      keyGenerator: (request) => request.auth?.id ?? request.ip,
    })
  },
  { name: 'security' },
)
