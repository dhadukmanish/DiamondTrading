import { fileURLToPath } from 'node:url'
import path from 'node:path'

import dotenv from 'dotenv'
import { z } from 'zod'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../')
const appRoot = path.resolve(here, '../../')

/**
 * Environment is read from the app-local .env first, then the repository root
 * .env. dotenv never overwrites an already-set variable, so real process
 * environment (production) always wins over both files.
 */
dotenv.config({
  path: [path.join(appRoot, '.env'), path.join(repoRoot, '.env')],
})

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    /** Comma-separated browser origins allowed by CORS. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_SSL: booleanish.default(false),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
    COOKIE_SECURE: booleanish.default(false),
    COOKIE_DOMAIN: z.string().optional(),

    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),

    SEED_TENANT_NAME: z.string().default('Demo Diamonds'),
    SEED_TENANT_SLUG: z.string().default('demo'),
    SEED_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
    SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
    SEED_ADMIN_NAME: z.string().default('Demo Administrator'),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      })
    }
    if (value.NODE_ENV === 'production' && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production',
      })
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  // Fail fast and loudly: a half-configured API is worse than one that refuses
  // to start. Never log the values themselves.
  throw new Error(`Invalid environment configuration:\n${issues}`)
}

export const env = parsed.data

export type Env = typeof env

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
export const isDevelopment = env.NODE_ENV === 'development'

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0)
