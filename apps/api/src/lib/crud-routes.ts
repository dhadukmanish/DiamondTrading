import type { FastifyInstance } from 'fastify';
import type { ZodObject, ZodRawShape } from 'zod';
import { idParam, listQuerySchema, type Module } from '@erp/shared';
import type { CrudRepository } from './crud';

/**
 * Registers list/get/create/update/delete for a master under `prefix`.
 * Permission = `${module}.${action}`; validation = shared zod schema.
 */
export function registerCrudRoutes(
  app: FastifyInstance,
  cfg: { prefix: string; module: Module; schema: ZodObject<ZodRawShape>; repo: CrudRepository },
) {
  const { prefix, module: mod, schema, repo } = cfg;
  const perm = (a: string) => ({ preHandler: app.authorize(`${mod}.${a}`) });

  app.get(prefix, perm('view'), async (req) => repo.list(req.ctx, listQuerySchema.parse(req.query)));

  app.get(`${prefix}/:id`, perm('view'), async (req) => repo.get(req.ctx, idParam.parse(req.params).id));

  app.post(prefix, perm('create'), async (req, reply) => {
    const row = await repo.create(req.ctx, schema.parse(req.body));
    return reply.code(201).send(row);
  });

  app.put(`${prefix}/:id`, perm('update'), async (req) =>
    repo.update(req.ctx, idParam.parse(req.params).id, schema.partial().parse(req.body)));

  app.delete(`${prefix}/:id`, perm('delete'), async (req, reply) => {
    await repo.remove(req.ctx, idParam.parse(req.params).id);
    return reply.code(204).send();
  });
}
