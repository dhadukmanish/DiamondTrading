import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { counters } from '../db/schema';

/** Atomically returns the next value for a tenant-scoped counter (contact serial, product serial, SKU…). */
export async function nextCounter(tx: Tx, tenantId: string, key: string): Promise<number> {
  const [row] = await tx.insert(counters).values({ tenantId, key, value: 1 })
    .onConflictDoUpdate({ target: [counters.tenantId, counters.key], set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return row!.value;
}
