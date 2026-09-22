import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/node-postgres/migrator'

import { closeDatabase, db } from './index'

/**
 * Applies pending SQL migrations from ./drizzle.
 *
 * Run with `pnpm db:migrate`. Migrations are generated (never hand-written)
 * with `pnpm db:generate` after changing the schema, and the generated SQL is
 * committed.
 */
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

async function main(): Promise<void> {
  console.log(`Applying migrations from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.log('Migrations applied.')
}

try {
  await main()
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
