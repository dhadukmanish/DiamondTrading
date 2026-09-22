import { createFirmSchema, idParamSchema, listQuerySchema, updateFirmSchema } from '@diamond/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { actorContext } from '../../lib/context'
import { unauthenticated } from '../../lib/errors'
import { requireTenantId } from '../../plugins/auth'
import { listBranches } from '../branches/branches.service'
import {
  createFirm,
  deleteFirm,
  getFirm,
  listAccessibleFirms,
  listFirms,
  updateFirm,
} from './firms.service'

export async function firmRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('firm:read')],
      schema: { querystring: listQuerySchema },
    },
    async (request) => listFirms(requireTenantId(request), request.query),
  )

  /**
   * Firms the caller can switch between. Not permission-gated beyond being
   * signed in: it only ever returns what the principal is already assigned to.
   */
  routes.get('/accessible', { preHandler: [app.authenticate] }, async (request) => {
    if (!request.auth) throw unauthenticated()
    return listAccessibleFirms(request.auth, requireTenantId(request))
  })

  routes.get(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('firm:read')],
      schema: { params: idParamSchema },
    },
    async (request) => getFirm(requireTenantId(request), request.params.id),
  )

  /** Convenience for the branch pickers, which always filter by firm. */
  routes.get(
    '/:id/branches',
    {
      preHandler: [app.authenticate, app.requirePermission('branch:read')],
      schema: { params: idParamSchema, querystring: listQuerySchema },
    },
    async (request) =>
      listBranches(requireTenantId(request), { ...request.query, firmId: request.params.id }),
  )

  routes.post(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('firm:create')],
      schema: { body: createFirmSchema },
    },
    async (request, reply) => {
      const firm = await createFirm(actorContext(request), request.body)
      return reply.status(201).send(firm)
    },
  )

  routes.patch(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('firm:update')],
      schema: { params: idParamSchema, body: updateFirmSchema },
    },
    async (request) => updateFirm(actorContext(request), request.params.id, request.body),
  )

  routes.delete(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('firm:delete')],
      schema: { params: idParamSchema },
    },
    async (request, reply) => {
      await deleteFirm(actorContext(request), request.params.id)
      return reply.status(204).send()
    },
  )
}
