import fastifyJwt from '@fastify/jwt'
import type { AccessTokenClaims, RefreshTokenClaims } from '@diamond/shared'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { env } from '../config/env'
import { durationToSeconds } from '../lib/duration'

/**
 * Shape of one namespaced signer created by @fastify/jwt. Only the two calls
 * used here are declared; the plugin's own types do not describe namespaces.
 */
interface NamespacedJwt {
  sign(payload: Record<string, unknown>, options?: Record<string, unknown>): string
  verify(token: string): unknown
}

/** Payload of the refresh token. `tok` also guarantees every token is unique. */
export interface RefreshTokenPayload extends RefreshTokenClaims {
  tok: string
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Lifetime of a freshly signed access token, in seconds. */
    accessTokenTtlSeconds: number
    signAccessToken(claims: AccessTokenClaims): string
    signRefreshToken(payload: RefreshTokenPayload): string
    /** Throws when the token is malformed, tampered with or expired. */
    verifyRefreshToken(token: string): unknown
  }

  interface FastifyRequest {
    /** Verifies the `Authorization: Bearer` access token. Rejects on failure. */
    accessVerify(): Promise<unknown>
  }
}

/**
 * Registers two independent JWT instances - one per secret - so an access token
 * can never be replayed as a refresh token, or the other way round.
 *
 * Every call into @fastify/jwt goes through the helpers decorated here, which
 * keeps the namespaced-decorator details in this one file.
 */
export const jwtPlugin = fp(
  async (app: FastifyInstance) => {
    const accessTtlSeconds = durationToSeconds(env.JWT_ACCESS_TTL, 900)

    await app.register(fastifyJwt, {
      secret: env.JWT_ACCESS_SECRET,
      namespace: 'access',
      jwtSign: 'accessSign',
      jwtVerify: 'accessVerify',
      sign: { expiresIn: env.JWT_ACCESS_TTL },
    })

    await app.register(fastifyJwt, {
      secret: env.JWT_REFRESH_SECRET,
      namespace: 'refresh',
      jwtSign: 'refreshSign',
      jwtVerify: 'refreshVerify',
      sign: { expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d` },
    })

    const namespaces = app.jwt as unknown as Record<string, NamespacedJwt>
    const access = namespaces['access']
    const refresh = namespaces['refresh']

    if (!access || !refresh) {
      throw new Error('JWT namespaces were not registered')
    }

    app.decorate('accessTokenTtlSeconds', accessTtlSeconds)

    app.decorate('signAccessToken', (claims: AccessTokenClaims) =>
      access.sign({ ...claims }, { expiresIn: env.JWT_ACCESS_TTL }),
    )

    app.decorate('signRefreshToken', (payload: RefreshTokenPayload) =>
      refresh.sign({ ...payload }, { expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d` }),
    )

    app.decorate('verifyRefreshToken', (token: string) => refresh.verify(token))
  },
  { name: 'jwt' },
)
