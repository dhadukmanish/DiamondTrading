import { API_PREFIX, APP_NAME } from '@diamond/shared'
import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { env, isTest } from './config/env'
import { closeDatabase } from './db/index'
import { authRoutes } from './modules/auth/auth.routes'
import { branchRoutes } from './modules/branches/branches.routes'
import { firmRoutes } from './modules/firms/firms.routes'
import { healthRoutes } from './modules/health/health.routes'
import { roleRoutes } from './modules/roles/roles.routes'
import { userRoutes } from './modules/users/users.routes'
import { authPlugin } from './plugins/auth'
import { errorHandlerPlugin } from './plugins/error-handler'
import { jwtPlugin } from './plugins/jwt'
import { securityPlugin } from './plugins/security'

/** How long a shutdown may take before the process is killed anyway. */
const SHUTDOWN_TIMEOUT_MS = 10_000

/**
 * Builds a fully wired, not-yet-listening application.
 *
 * Every plugin here is `fastify-plugin` wrapped, so its decorators land on the
 * root instance and are visible to all routes regardless of where they are
 * mounted. Order still matters: `auth` declares a dependency on `jwt`, and the
 * security layer is registered first so its rate limit also covers the
 * not-found handler installed by the error handler.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  })

  // Zod is the single source of truth for request validation and response
  // serialization; routes opt in per-instance with `withTypeProvider`.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(securityPlugin)
  await app.register(jwtPlugin)
  await app.register(authPlugin)
  await app.register(errorHandlerPlugin)

  // Probes live outside the versioned prefix so infrastructure never has to
  // follow an API version bump.
  await app.register(healthRoutes)

  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` })
  await app.register(firmRoutes, { prefix: `${API_PREFIX}/firms` })
  await app.register(branchRoutes, { prefix: `${API_PREFIX}/branches` })
  await app.register(userRoutes, { prefix: `${API_PREFIX}/users` })
  await app.register(roleRoutes, { prefix: `${API_PREFIX}/roles` })

  return app
}

async function start(): Promise<void> {
  const app = await buildApp()

  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true

    app.log.info({ signal }, 'Shutting down')

    // A connection that refuses to drain must not hold the process open
    // forever; orchestrators expect the container to actually exit.
    const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS)
    force.unref()

    try {
      // Stop accepting requests before tearing down the pool they depend on.
      await app.close()
      await closeDatabase()
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error }, 'Graceful shutdown failed')
      process.exit(1)
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal)
    })
  }

  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT })
    app.log.info(
      { name: APP_NAME, prefix: API_PREFIX, env: env.NODE_ENV },
      'API listening',
    )
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start the API')
    await closeDatabase()
    process.exit(1)
  }
}

// Under test the module is imported for `buildApp` only; nothing should bind a
// port as a side effect of that import.
if (!isTest) {
  await start()
}
