import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: false,
  sourcemap: true,
  clean: true,
  // Bundle the workspace package so the built output does not need the
  // monorepo layout at runtime; keep real npm deps external.
  noExternal: ['@diamond/shared'],
})
