import { defineConfig } from 'drizzle-kit'

import { env } from './src/config/env'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  // Every column is named explicitly in the schema, so no casing strategy is
  // configured here (it would otherwise have to be mirrored on the client).
  verbose: true,
  strict: true,
})
