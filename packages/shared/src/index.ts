/**
 * @diamond/shared
 *
 * Contracts shared by the API and the web client: the multi-tenant hierarchy
 * (tenant -> firm -> branch -> user), the RBAC catalog, and the Zod schemas
 * used for request/response validation on both sides of the wire.
 *
 * Imports are extensionless because every consumer resolves this package with
 * bundler-style resolution (tsup/esbuild for the API, Vite for the web app).
 *
 * This file is also the `source` export condition of the package. TypeScript is
 * the only tool configured to match it (`customConditions` in
 * tsconfig.base.json), so `tsc --noEmit` type-checks against these sources and
 * never needs `dist/` to have been built first. Runtime and bundlers keep
 * resolving `dist/`, which is what `pnpm build` produces.
 */

export * from './constants'
export * from './rbac/index'
export * from './schemas/index'
export * from './types/index'
