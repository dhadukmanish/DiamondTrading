import {
  createRoleSchema,
  idParamSchema,
  listQuerySchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from '@diamond/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { actorContext } from '../../lib/context'
import { requireTenantId } from '../../plugins/auth'
import {
  createRole,
  deleteRole,
  getRole,
  listPermissions,
  listRoles,
  setRolePermissions,
  updateRole,
} from './roles.service'

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  /** The permission catalog, used to render the role matrix. */
  routes.get(
    '/permissions',
    { preHandler: [app.authenticate, app.requirePermission('role:read')] },
    async () => listPermissions(),
  )

  routes.get(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('role:read')],
      schema: { querystring: listQuerySchema },
    },
    async (request) => listRoles(requireTenantId(request), request.query),
  )

  routes.get(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('role:read')],
      schema: { params: idParamSchema },
    },
    async (request) => getRole(requireTenantId(request), request.params.id),
  )

  routes.post(
    '/',
    {
      preHandler: [app.authenticate, app.requirePermission('role:create')],
      schema: { body: createRoleSchema },
    },
    async (request, reply) => {
      const role = await createRole(actorContext(request), request.body)
      return reply.status(201).send(role)
    },
  )

  routes.patch(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('role:update')],
      schema: { params: idParamSchema, body: updateRoleSchema },
    },
    async (request) => updateRole(actorContext(request), request.params.id, request.body),
  )

  routes.put(
    '/:id/permissions',
    {
      preHandler: [app.authenticate, app.requirePermission('role:update')],
      schema: { params: idParamSchema, body: setRolePermissionsSchema },
    },
    async (request) =>
      setRolePermissions(actorContext(request), request.params.id, request.body.permissions),
  )

  routes.delete(
    '/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('role:delete')],
      schema: { params: idParamSchema },
    },
    async (request, reply) => {
      await deleteRole(actorContext(request), request.params.id)
      return reply.status(204).send()
    },
  )
}
