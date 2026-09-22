import type {
  Branch,
  CreateBranchInput,
  ListBranchQuery,
  Paginated,
  UpdateBranchInput,
} from '@diamond/shared'
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm'

import { db, type DbExecutor } from '../../db/index'
import { type BranchRow, branches, firms } from '../../db/schema/index'
import { recordAudit } from '../../lib/audit'
import type { ActorContext } from '../../lib/context'
import { conflict, notFound } from '../../lib/errors'
import { buildPaginationMeta, toOffset } from '../../lib/pagination'
import { containsPattern } from '../../lib/query'

function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    tenantId: row.tenantId,
    firmId: row.firmId,
    name: row.name,
    code: row.code,
    type: row.type,
    isHeadOffice: row.isHeadOffice,
    email: row.email,
    phone: row.phone,
    address: row.address ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function scopeFilter(tenantId: string): SQL {
  return and(eq(branches.tenantId, tenantId), isNull(branches.deletedAt)) as SQL
}

/**
 * Confirms the firm exists inside this tenant, which is also what stops a
 * branch from being attached to another tenant's firm.
 */
async function requireFirm(executor: DbExecutor, tenantId: string, firmId: string): Promise<void> {
  const rows = await executor
    .select({ id: firms.id })
    .from(firms)
    .where(and(eq(firms.tenantId, tenantId), eq(firms.id, firmId), isNull(firms.deletedAt)))
    .limit(1)

  if (!rows[0]) throw notFound('Firm')
}

export async function listBranches(
  tenantId: string,
  query: ListBranchQuery,
): Promise<Paginated<Branch>> {
  const filters: SQL[] = [scopeFilter(tenantId)]

  if (query.firmId) filters.push(eq(branches.firmId, query.firmId))
  if (query.type) filters.push(eq(branches.type, query.type))
  if (query.status) filters.push(eq(branches.status, query.status))
  if (query.search) {
    const pattern = containsPattern(query.search)
    filters.push(or(ilike(branches.name, pattern), ilike(branches.code, pattern)) as SQL)
  }

  const where = and(...filters) as SQL
  const order = query.sortOrder === 'desc' ? desc(branches.name) : asc(branches.name)

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(branches)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(branches).where(where),
  ])

  return {
    data: rows.map(toBranch),
    meta: buildPaginationMeta(totals[0]?.value ?? 0, query),
  }
}

export async function getBranch(tenantId: string, id: string): Promise<Branch> {
  const rows = await db
    .select()
    .from(branches)
    .where(and(scopeFilter(tenantId), eq(branches.id, id)))
    .limit(1)

  const row = rows[0]
  if (!row) throw notFound('Branch')
  return toBranch(row)
}

async function assertCodeAvailable(
  executor: DbExecutor,
  firmId: string,
  code: string,
  excludeId?: string,
): Promise<void> {
  const rows = await executor
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.firmId, firmId), eq(branches.code, code)))
    .limit(2)

  if (rows.some((row) => row.id !== excludeId)) {
    throw conflict(`A branch with code ${code} already exists in this firm`)
  }
}

/**
 * A firm has at most one head office. The database enforces it too; demoting
 * the incumbent here is what makes "make this the head office" work instead of
 * failing with a constraint violation.
 */
async function demoteOtherHeadOffices(
  executor: DbExecutor,
  firmId: string,
  keepId?: string,
): Promise<void> {
  const where = and(
    eq(branches.firmId, firmId),
    eq(branches.isHeadOffice, true),
    isNull(branches.deletedAt),
  ) as SQL

  const rows = await executor.select({ id: branches.id }).from(branches).where(where)

  for (const row of rows) {
    if (row.id === keepId) continue
    await executor.update(branches).set({ isHeadOffice: false }).where(eq(branches.id, row.id))
  }
}

export async function createBranch(
  context: ActorContext,
  input: CreateBranchInput,
): Promise<Branch> {
  return db.transaction(async (tx) => {
    await requireFirm(tx, context.tenantId, input.firmId)
    await assertCodeAvailable(tx, input.firmId, input.code)

    if (input.isHeadOffice) {
      await demoteOtherHeadOffices(tx, input.firmId)
    }

    const inserted = await tx
      .insert(branches)
      .values({
        // Denormalised from the firm rather than taken from the request, so it
        // cannot disagree with the parent.
        tenantId: context.tenantId,
        firmId: input.firmId,
        name: input.name,
        code: input.code,
        type: input.type,
        isHeadOffice: input.isHeadOffice,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
      })
      .returning()

    const row = inserted[0]
    if (!row) throw conflict('Branch could not be created')

    await recordAudit(tx, {
      tenantId: context.tenantId,
      firmId: row.firmId,
      branchId: row.id,
      actorId: context.actorId,
      action: 'branch.created',
      entityType: 'branch',
      entityId: row.id,
      after: { name: row.name, code: row.code },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    return toBranch(row)
  })
}

export async function updateBranch(
  context: ActorContext,
  id: string,
  input: UpdateBranchInput,
): Promise<Branch> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(branches)
      .where(and(scopeFilter(context.tenantId), eq(branches.id, id)))
      .limit(1)

    const before = existing[0]
    if (!before) throw notFound('Branch')

    if (input.isHeadOffice) {
      await demoteOtherHeadOffices(tx, before.firmId, id)
    }

    const updated = await tx
      .update(branches)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.isHeadOffice !== undefined ? { isHeadOffice: input.isHeadOffice } : {}),
        ...(input.email !== undefined ? { email: input.email ?? null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.address !== undefined ? { address: input.address ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(branches.id, id))
      .returning()

    const row = updated[0]
    if (!row) throw notFound('Branch')

    await recordAudit(tx, {
      tenantId: context.tenantId,
      firmId: row.firmId,
      branchId: row.id,
      actorId: context.actorId,
      action: 'branch.updated',
      entityType: 'branch',
      entityId: row.id,
      before: { name: before.name, status: before.status },
      after: { name: row.name, status: row.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    return toBranch(row)
  })
}

export async function deleteBranch(context: ActorContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: branches.id, name: branches.name, firmId: branches.firmId })
      .from(branches)
      .where(and(scopeFilter(context.tenantId), eq(branches.id, id)))
      .limit(1)

    const row = existing[0]
    if (!row) throw notFound('Branch')

    await tx.update(branches).set({ deletedAt: new Date() }).where(eq(branches.id, id))

    await recordAudit(tx, {
      tenantId: context.tenantId,
      firmId: row.firmId,
      actorId: context.actorId,
      action: 'branch.deleted',
      entityType: 'branch',
      entityId: id,
      before: { name: row.name },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
  })
}
