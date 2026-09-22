import {
  API_PREFIX,
  changePasswordSchema,
  loginSchema,
  REFRESH_TOKEN_COOKIE,
} from '@diamond/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { env, isProduction } from '../../config/env'
import { unauthenticated } from '../../lib/errors'
import {
  changePassword,
  login,
  logout,
  type RequestMeta,
  refreshSession,
  type Session,
} from './auth.service'

/** Only the refresh endpoint ever needs the cookie, so scope it to that path. */
const COOKIE_PATH = `${API_PREFIX}/auth`

function requestMeta(request: FastifyRequest): RequestMeta {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  }
}

function setRefreshCookie(reply: FastifyReply, session: Session): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: isProduction ? 'strict' : 'lax',
    path: COOKIE_PATH,
    expires: session.refreshExpiresAt,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  })
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: COOKIE_PATH })
}

function sessionResponse(session: Session) {
  return {
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    user: session.user,
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.post(
    '/login',
    {
      // Credential stuffing is the obvious attack here, so this route gets a
      // much tighter budget than the global one.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: loginSchema },
    },
    async (request, reply) => {
      const session = await login(app, request.body, requestMeta(request))
      setRefreshCookie(reply, session)
      return sessionResponse(session)
    },
  )

  routes.post(
    '/refresh',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const token = request.cookies[REFRESH_TOKEN_COOKIE]
      if (!token) throw unauthenticated('No session cookie')

      try {
        const session = await refreshSession(app, token, requestMeta(request))
        setRefreshCookie(reply, session)
        return sessionResponse(session)
      } catch (error) {
        // A refresh that fails is never recoverable, so drop the stale cookie
        // instead of letting the client retry with it forever.
        clearRefreshCookie(reply)
        throw error
      }
    },
  )

  routes.post('/logout', async (request, reply) => {
    await logout(app, request.cookies[REFRESH_TOKEN_COOKIE])
    clearRefreshCookie(reply)
    return reply.status(204).send()
  })

  routes.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    return request.auth
  })

  routes.post(
    '/change-password',
    {
      preHandler: [app.authenticate],
      schema: { body: changePasswordSchema },
    },
    async (request, reply) => {
      if (!request.auth) throw unauthenticated()
      await changePassword(request.auth, request.body, requestMeta(request))
      // Every session was just revoked, including this one.
      clearRefreshCookie(reply)
      return reply.status(204).send()
    },
  )
}
