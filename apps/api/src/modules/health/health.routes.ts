import { APP_NAME } from '@diamond/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../../db/index'

/**
 * Liveness and readiness probes.
 *
 * Mounted outside the versioned API prefix so infrastructure (compose health
 * checks, nginx, the deploy workflow) has a stable path that never moves with
 * the API version. Both are exempt from the rate limit: a throttled probe would
 * report a healthy service as down.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    name: APP_NAME,
    uptime: Math.round(process.uptime()),
  }))

  app.get('/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`)
    } catch (error) {
      app.log.error({ err: error }, 'Readiness check failed')
      return reply.status(503).send({
        error: { code: 'INTERNAL_ERROR', message: 'Database is not reachable' },
      })
    }

    return { status: 'ready', database: 'up' }
  })
}
