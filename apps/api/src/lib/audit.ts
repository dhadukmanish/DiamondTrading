import type { DbExecutor } from '../db/index'
import { auditLogs } from '../db/schema/index'

export interface AuditEntry {
  tenantId?: string | null
  firmId?: string | null
  branchId?: string | null
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

/** Fields that must never be written to the audit trail. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'newPassword',
  'currentPassword',
  'accessToken',
  'refreshToken',
  'tokenHash',
])

function redact(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload) return null
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    result[key] = REDACTED_KEYS.has(key) ? '[redacted]' : value
  }
  return result
}

/**
 * Appends an audit row. Pass the surrounding transaction as `executor` so the
 * audit entry commits or rolls back together with the change it describes.
 */
export async function recordAudit(executor: DbExecutor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    tenantId: entry.tenantId ?? null,
    firmId: entry.firmId ?? null,
    branchId: entry.branchId ?? null,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: redact(entry.before),
    after: redact(entry.after),
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent?.slice(0, 255) ?? null,
  })
}
