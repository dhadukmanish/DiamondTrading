import {
  createUserSchema,
  idParamSchema,
  listUserQuerySchema,
  setUserAssignmentsSchema,
  updateUserSchema,
} from '@diamond/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { actorContext } from '../../lib/context'
import { requireTenantId } from '../../plugins/auth'
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  setUserAssignments,
  updateUser,
} from './users.service'

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('user:read')],
      schema: { querystring: listUserQuerySchema },
    },
    async (request) => listUsers(requireTenantId(request), request.query),
  )

  routes.get(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('user:read')],
      schema: { params: idParamSchema },
    },
    async (request) => getUser(requireTenantId(request), request.params.id),
  )

  routes.post(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('user:create')],
      schema: { body: createUserSchema },
    },
    async (request, reply) => {
      const user = await createUser(actorContext(request), request.body)
      return reply.status(201).send(user)
    },
  )

  routes.patch(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('user:update')],
      schema: { params: idParamSchema, body: updateUserSchema },
    },
    async (request) => updateUser(actorContext(request), request.params.id, request.body),
  )

  routes.put(
    '/:id/assignments',
    {
      preHandler: [app.authenticate, app.requirePermission('user:update')],
      schema: { params: idParamSchema, body: setUserAssignmentsSchema },
    },
    async (request) => setUserAssignments(actorContext(request), request.params.id, request.body),
  )

  routes.delete(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('user:delete')],
      schema: { params: idParamSchema },
    },
    async (request, reply) => {
      await deleteUser(actorContext(request), request.params.id)
      return reply.status(204).send()
    },
  )
}
