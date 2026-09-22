import {
  createBranchSchema,
  idParamSchema,
  listBranchQuerySchema,
  updateBranchSchema,
} from '@diamond/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { actorContext } from '../../lib/context'
import { requireTenantId } from '../../plugins/auth'
import {
  createBranch,
  deleteBranch,
  getBranch,
  listBranches,
  updateBranch,
} from './branches.service'

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('branch:read')],
      schema: { querystring: listBranchQuerySchema },
    },
    async (request) => listBranches(requireTenantId(request), request.query),
  )

  routes.get(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('branch:read')],
      schema: { params: idParamSchema },
    },
    async (request) => getBranch(requireTenantId(request), request.params.id),
  )

  routes.post(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('branch:create')],
      schema: { body: createBranchSchema },
    },
    async (request, reply) => {
      const branch = await createBranch(actorContext(request), request.body)
      return reply.status(201).send(branch)
    },
  )

  routes.patch(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('branch:update')],
      schema: { params: idParamSchema, body: updateBranchSchema },
    },
    async (request) => updateBranch(actorContext(request), request.params.id, request.body),
  )

  routes.delete(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('branch:delete')],
      schema: { params: idParamSchema },
    },
    async (request, reply) => {
      await deleteBranch(actorContext(request), request.params.id)
      return reply.status(204).send()
    },
  )
}
