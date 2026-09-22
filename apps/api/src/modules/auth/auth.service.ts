import { randomUUID } from 'node:crypto'

import {
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  refreshTokenClaimsSchema,
} from '@diamond/shared'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env'
import { db, type DbExecutor } from '../../db/index'
import { refreshTokens, tenants, users } from '../../db/schema/index'
import { recordAudit } from '../../lib/audit'
import { generateOpaqueToken, sha256Hex } from '../../lib/crypto'
import { addDays } from '../../lib/duration'
import { invalidCredentials, tenantInactive, unauthenticated } from '../../lib/errors'
import { hashPassword, needsRehash, verifyPassword } from '../../lib/password'
import { loadIdentity } from './identity.service'

/** Tenant lifecycle states whose users may sign in. */
const USABLE_TENANT_STATUSES = new Set(['trial', 'active'])

export interface RequestMeta {
  ipAddress?: string | null
  userAgent?: string | null
}

export interface Session {
  accessToken: string
  expiresIn: number
  user: AuthUser
  /** Raw refresh token; the caller puts it in an httpOnly cookie. */
  refreshToken: string
  refreshExpiresAt: Date
  /** `refresh_tokens.id` of the session that was just created. */
  sessionId: string
}

/**
 * A hash to verify against when the email is unknown, so a failed login costs
 * the same as a successful one and cannot be used to enumerate accounts. Built
 * once, lazily, because scrypt is deliberately expensive.
 */
let decoyHash: Promise<string> | null = null

function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(generateOpaqueToken(24))
  return decoyHash
}

async function issueSession(
  app: FastifyInstance,
  executor: DbExecutor,
  authUser: AuthUser,
  meta: RequestMeta,
): Promise<Session> {
  // The row id is generated up front so it can be embedded in the token as
  // `sid`, which makes a single session revocable without a second write.
  const sessionId = randomUUID()
  const expiresAt = addDays(new Date(), env.JWT_REFRESH_TTL_DAYS)

  const refreshToken = app.signRefreshToken({
    sub: authUser.id,
    sid: sessionId,
    tok: generateOpaqueToken(),
  })

  await executor.insert(refreshTokens).values({
    id: sessionId,
    userId: authUser.id,
    tokenHash: sha256Hex(refreshToken),
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 255) ?? null,
    ipAddress: meta.ipAddress ?? null,
  })

  return {
    accessToken: app.signAccessToken({
      sub: authUser.id,
      tenantId: authUser.tenantId,
      isSuperAdmin: authUser.isSuperAdmin,
    }),
    expiresIn: app.accessTokenTtlSeconds,
    user: authUser,
    refreshToken,
    refreshExpiresAt: expiresAt,
    sessionId,
  }
}

export async function login(
  app: FastifyInstance,
  input: LoginInput,
  meta: RequestMeta,
): Promise<Session> {
  const candidates = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      status: users.status,
      tenantId: users.tenantId,
      tenantSlug: tenants.slug,
      tenantStatus: tenants.status,
    })
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .where(and(eq(users.email, input.email), isNull(users.deletedAt)))

  const matches = input.tenantSlug
    ? candidates.filter((row) => row.tenantSlug === input.tenantSlug)
    : candidates

  // The same email may exist in several tenants; without a slug there is no way
  // to tell which account was meant, and guessing would be a security hole.
  const account = matches.length === 1 ? matches[0] : undefined

  if (!account) {
    await verifyPassword(input.password, await getDecoyHash())
    throw invalidCredentials()
  }

  const passwordOk = await verifyPassword(input.password, account.passwordHash)
  if (!passwordOk || account.status !== 'active') {
    await recordAudit(db, {
      tenantId: account.tenantId,
      actorId: account.id,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: account.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    throw invalidCredentials()
  }

  if (account.tenantStatus && !USABLE_TENANT_STATUSES.has(account.tenantStatus)) {
    throw tenantInactive()
  }

  const identity = await loadIdentity(db, account.id)
  if (!identity) throw invalidCredentials()

  return db.transaction(async (tx) => {
    const session = await issueSession(app, tx, identity.authUser, meta)

    await tx
      .update(users)
      .set({
        lastLoginAt: new Date(),
        // Transparently upgrade a hash produced with weaker parameters, now
        // that the plaintext is available and already verified.
        ...(needsRehash(account.passwordHash)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      })
      .where(eq(users.id, account.id))

    await recordAudit(tx, {
      tenantId: account.tenantId,
      actorId: account.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: account.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return session
  })
}

/**
 * Exchanges a refresh token for a new pair, rotating the stored session.
 *
 * A token that is presented after it was already rotated is treated as theft:
 * every session for that user is revoked rather than just the replayed one.
 */
export async function refreshSession(
  app: FastifyInstance,
  rawToken: string,
  meta: RequestMeta,
): Promise<Session> {
  let claims: unknown
  try {
    claims = app.verifyRefreshToken(rawToken)
  } catch {
    throw unauthenticated('Invalid or expired session')
  }

  const parsed = refreshTokenClaimsSchema.safeParse(claims)
  if (!parsed.success) throw unauthenticated('Malformed session token')

  const tokenHash = sha256Hex(rawToken)

  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, parsed.data.sid))
    .limit(1)

  const stored = rows[0]
  if (!stored || stored.userId !== parsed.data.sub) {
    throw unauthenticated('Invalid or expired session')
  }

  if (stored.tokenHash !== tokenHash || stored.revokedAt) {
    await revokeAllSessions(db, stored.userId)
    await recordAudit(db, {
      actorId: stored.userId,
      action: 'auth.refresh_replayed',
      entityType: 'refresh_token',
      entityId: stored.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    throw unauthenticated('Session has been revoked, sign in again')
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw unauthenticated('Session has expired, sign in again')
  }

  const identity = await loadIdentity(db, stored.userId)
  if (!identity) throw unauthenticated('This account is no longer active')
  if (identity.tenantStatus && !USABLE_TENANT_STATUSES.has(identity.tenantStatus)) {
    throw tenantInactive()
  }

  return db.transaction(async (tx) => {
    const session = await issueSession(app, tx, identity.authUser, meta)
    // Point the retired row at its successor so a replay can be traced.
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById: session.sessionId })
      .where(eq(refreshTokens.id, stored.id))
    return session
  })
}

/** Revokes the session a refresh token belongs to. Never throws for a bad token. */
export async function logout(app: FastifyInstance, rawToken: string | undefined): Promise<void> {
  if (!rawToken) return

  let claims: unknown
  try {
    claims = app.verifyRefreshToken(rawToken)
  } catch {
    return
  }

  const parsed = refreshTokenClaimsSchema.safeParse(claims)
  if (!parsed.success) return

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, parsed.data.sid), isNull(refreshTokens.revokedAt)))
}

export async function revokeAllSessions(executor: DbExecutor, userId: string): Promise<void> {
  await executor
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}

/**
 * Changes the caller's own password. Every other session is dropped, because a
 * password change is also how a user reacts to a suspected compromise.
 */
export async function changePassword(
  authUser: AuthUser,
  input: ChangePasswordInput,
  meta: RequestMeta,
): Promise<void> {
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash, tenantId: users.tenantId })
    .from(users)
    .where(and(eq(users.id, authUser.id), isNull(users.deletedAt)))
    .limit(1)

  const user = rows[0]
  if (!user) throw unauthenticated()

  const ok = await verifyPassword(input.currentPassword, user.passwordHash)
  if (!ok) throw invalidCredentials()

  const passwordHash = await hashPassword(input.newPassword)

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id))
    await revokeAllSessions(tx, user.id)
    await recordAudit(tx, {
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
  })
}

/**
 * Housekeeping: drops refresh tokens that are expired or were revoked long
 * enough ago to be useless for replay forensics.
 */
export async function purgeStaleSessions(olderThan: Date): Promise<void> {
  await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, olderThan), lt(refreshTokens.revokedAt, olderThan)))
}
