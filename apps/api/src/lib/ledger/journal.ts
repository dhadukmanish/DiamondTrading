import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { accounts, journalEntries, journalLines } from '../../db/schema';
import { badRequest } from '../errors';
import type { Ctx } from '../context';

export interface JournalLineInput {
  accountId?: string;
  systemKey?: string;          // resolved to the tenant's system account
  contactId?: string | null;
  variantId?: string | null;
  debit?: number;
  credit?: number;
  narration?: string;
}
export interface JournalInput {
  firmId: string; branchId?: string | null; date: string;
  sourceType: string; sourceId: string; docNo: string; narration?: string | null;
  lines: JournalLineInput[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Resolve a `system_key` (e.g. "inventory_asset") to the tenant's account id. */
export async function systemAccount(tx: Tx, tenantId: string, key: string): Promise<string> {
  const [a] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.tenantId, tenantId), eq(accounts.systemKey, key)));
  if (!a) throw badRequest(`System account "${key}" is missing — run the seed`);
  return a.id;
}

/**
 * Posts one balanced entry. Zero-amount lines are dropped; debit must equal credit.
 * Call inside the document's transaction so the document and its entry commit together.
 */
export async function postJournal(tx: Tx, ctx: Ctx, input: JournalInput) {
  const lines = input.lines.map((l) => ({ ...l, debit: r4(l.debit ?? 0), credit: r4(l.credit ?? 0) })).filter((l) => l.debit !== 0 || l.credit !== 0);
  if (!lines.length) return null;
  const dr = r4(lines.reduce((s, l) => s + l.debit, 0));
  const cr = r4(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) > 0.005) throw badRequest(`Journal not balanced: debit ${dr} ≠ credit ${cr}`);

  const [entry] = await tx.insert(journalEntries).values({
    tenantId: ctx.tenantId, firmId: input.firmId, branchId: input.branchId ?? null, date: input.date,
    sourceType: input.sourceType, sourceId: input.sourceId, docNo: input.docNo, narration: input.narration ?? null, createdBy: ctx.userId,
  }).returning({ id: journalEntries.id });

  const rows = [];
  for (const [i, l] of lines.entries()) {
    const accountId = l.accountId ?? (await systemAccount(tx, ctx.tenantId, l.systemKey!));
    rows.push({ entryId: entry!.id, accountId, contactId: l.contactId ?? null, variantId: l.variantId ?? null, debit: String(l.debit), credit: String(l.credit), narration: l.narration ?? null, sortOrder: i });
  }
  await tx.insert(journalLines).values(rows);
  return entry!.id;
}

/** Removes the entry a document posted (used when a document is deleted). */
export async function unpostJournal(tx: Tx, sourceType: string, sourceId: string) {
  await tx.delete(journalEntries).where(and(eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId)));
}
