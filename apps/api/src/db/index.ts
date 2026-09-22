import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { env } from '../config/env'
import * as schema from './schema/index'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
})

export const db = drizzle(pool, { schema })

export type Database = typeof db

/**
 * The transaction-scoped handle passed to `db.transaction(...)`. Service
 * functions accept `Database | Transaction` so they compose inside a
 * transaction without needing two code paths.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type DbExecutor = Database | Transaction

export async function closeDatabase(): Promise<void> {
  await pool.end()
}

export { schema }
