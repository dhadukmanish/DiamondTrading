import type {
  AuthUser,
  CreateFirmInput,
  Firm,
  ListQuery,
  Paginated,
  UpdateFirmInput,
} from '@diamond/shared'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'

import { db, type DbExecutor } from '../../db/index'
import { branches, firms, type FirmRow } from '../../db/schema/index'
import { recordAudit } from '../../lib/audit'
import type { ActorContext } from '../../lib/context'
import { conflict, notFound } from '../../lib/errors'
import { buildPaginationMeta, toOffset } from '../../lib/pagination'
import { containsPattern } from '../../lib/query'
import { hasTenantWideAccess } from '../auth/identity.service'

function toFirm(row: FirmRow): Firm {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    legalName: row.legalName,
    code: row.code,
    gstin: row.gstin,
    pan: row.pan,
    email: row.email,
    phone: row.phone,
    baseCurrency: row.baseCurrency,
    address: row.address ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Every read path is scoped to one tenant and hides soft-deleted rows. */
function scopeFilter(tenantId: string): SQL {
  return and(eq(firms.tenantId, tenantId), isNull(firms.deletedAt)) as SQL
}

export async function listFirms(tenantId: string, query: ListQuery): Promise<Paginated<Firm>> {
  const filters: SQL[] = [scopeFilter(tenantId)]

  if (query.search) {
    const pattern = containsPattern(query.search)
    filters.push(or(ilike(firms.name, pattern), ilike(firms.code, pattern)) as SQL)
  }
  if (query.status) {
    filters.push(eq(firms.status, query.status))
  }

  const where = and(...filters) as SQL
  const order = query.sortOrder === 'desc' ? desc(firms.name) : asc(firms.name)

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(firms)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(firms).where(where),
  ])

  return {
    data: rows.map(toFirm),
    meta: buildPaginationMeta(totals[0]?.value ?? 0, query),
  }
}

/**
 * Firms the principal may actually act on - what the firm switcher lists.
 *
 * Tenant- and platform-scoped assignments carry no firm id and therefore cover
 * every firm; everyone else sees only the firms they are assigned to.
 */
export async function listAccessibleFirms(
  authUser: AuthUser,
  tenantId: string,
): Promise<Firm[]> {
  const filters: SQL[] = [scopeFilter(tenantId), eq(firms.status, 'active')]

  if (!hasTenantWideAccess(authUser)) {
    if (authUser.firmIds.length === 0) return []
    filters.push(inArray(firms.id, authUser.firmIds))
  }

  const rows = await db
    .select()
    .from(firms)
    .where(and(...filters))
    .orderBy(asc(firms.name))

  return rows.map(toFirm)
}

export async function getFirm(tenantId: string, id: string): Promise<Firm> {
  const rows = await db
    .select()
    .from(firms)
    .where(and(scopeFilter(tenantId), eq(firms.id, id)))
    .limit(1)

  const row = rows[0]
  if (!row) throw notFound('Firm')
  return toFirm(row)
}

async function assertCodeAvailable(
  executor: DbExecutor,
  tenantId: string,
  code: string,
  excludeId?: string,
): Promise<void> {
  const rows = await executor
    .select({ id: firms.id })
    .from(firms)
    .where(and(eq(firms.tenantId, tenantId), eq(firms.code, code)))
    .limit(2)

  if (rows.some((row) => row.id !== excludeId)) {
    throw conflict(`A firm with code ${code} already exists`)
  }
}

export async function createFirm(context: ActorContext, input: CreateFirmInput): Promise<Firm> {
  return db.transaction(async (tx) => {
    await assertCodeAvailable(tx, context.tenantId, input.code)

    const inserted = await tx
      .insert(firms)
      .values({
        tenantId: context.tenantId,
        name: input.name,
        legalName: input.legalName ?? null,
        code: input.code,
        gstin: input.gstin ?? null,
        pan: input.pan ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        baseCurrency: input.baseCurrency,
        address: input.address ?? null,
      })
      .returning()

    const row = inserted[0]
    if (!row) throw conflict('Firm could not be created')

    await recordAudit(tx, {
      tenantId: context.tenantId,
      firmId: row.id,
      actorId: context.actorId,
      action: 'firm.created',
      entityType: 'firm',
      entityId: row.id,
      after: { name: row.name, code: row.code },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    return toFirm(row)
  })
}

export async function updateFirm(
  context: ActorContext,
  id: string,
  input: UpdateFirmInput,
): Promise<Firm> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(firms)
      .where(and(scopeFilter(context.tenantId), eq(firms.id, id)))
      .limit(1)

    const before = existing[0]
    if (!before) throw notFound('Firm')

    const updated = await tx
      .update(firms)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.legalName !== undefined ? { legalName: input.legalName ?? null } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin ?? null } : {}),
        ...(input.pan !== undefined ? { pan: input.pan ?? null } : {}),
        ...(input.email !== undefined ? { email: input.email ?? null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.baseCurrency !== undefined ? { baseCurrency: input.baseCurrency } : {}),
        ...(input.address !== undefined ? { address: input.address ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(firms.id, id))
      .returning()

    const row = updated[0]
    if (!row) throw notFound('Firm')

    await recordAudit(tx, {
      tenantId: context.tenantId,
      firmId: row.id,
      actorId: context.actorId,
      action: 'firm.updated',
      entityType: 'firm',
      entityId: row.id,
      before: { name: before.name, status: before.status },
      after: { name: row.name, status: row.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    return toFirm(row)
  })
}

/**
 * Soft-deletes a firm. Refused while it still has live branches, so the
 * hierarchy can never contain an orphaned branch.
 */
export async function deleteFirm(context: ActorContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: firms.id, name: firms.name })
      .from(firms)
      .where(and(scopeFilter(context.tenantId), eq(firms.id, id)))
      .limit(1)

    const row = existing[0]
    if (!row) throw notFound('Firm')

    const liveBranches = await tx
      .select({ value: count() })
      .from(branches)
      .where(and(eq(branches.firmId, id), isNull(branches.deletedAt)))

    if ((liveBranches[0]?.value ?? 0) > 0) {
      throw conflict('Remove the branches of this firm before deleting it')
    }

    await tx.update(firms).set({ deletedAt: new Date() }).where(eq(firms.id, id))

    await recordAudit(tx, {
      tenantId: context.tenantId,
      firmId: id,
      actorId: context.actorId,
      action: 'firm.deleted',
      entityType: 'firm',
      entityId: id,
      before: { name: row.name },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
  })
}
