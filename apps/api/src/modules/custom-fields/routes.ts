import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { customFieldOptionsBulkSchema, customFieldSchema, idParam } from '@erp/shared';
import { db } from '../../db/client';
import { customFieldOptions, customFields } from '../../db/schema/index';
import { crudRepository } from '../../lib/crud';
import { registerCrudRoutes } from '../../lib/crud-routes';
import { notFound } from '../../lib/errors';

export async function customFieldRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, { prefix: '/custom-fields', module: 'custom_fields', schema: customFieldSchema,
    repo: crudRepository(customFields, { searchable: [customFields.label, customFields.key], defaultSort: 'sortOrder' }) });

  /** Field definitions + options for one module — what a form needs to render its "Additional Fields". */
  app.get('/custom-fields/module/:module', { preHandler: app.authenticate }, async (req) => {
    const { module: mod } = z.object({ module: z.string() }).parse(req.params);
    const fields = await db.select().from(customFields)
      .where(and(eq(customFields.tenantId, req.ctx.tenantId), eq(customFields.module, mod), eq(customFields.isActive, true)))
      .orderBy(asc(customFields.sortOrder));
    const ids = fields.map((f) => f.id);
    const opts = ids.length ? await db.select().from(customFieldOptions).where(inArray(customFieldOptions.fieldId, ids)).orderBy(asc(customFieldOptions.sortOrder)) : [];
    return fields.map((f) => ({ ...f, options: opts.filter((o) => o.fieldId === f.id) }));
  });

  /** "Configure Options" — replaces the option list of a dropdown field. */
  app.put('/custom-fields/:id/options', { preHandler: app.authorize('custom_fields.update') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { options } = customFieldOptionsBulkSchema.parse(req.body);
    return db.transaction(async (tx) => {
      const [f] = await tx.select({ id: customFields.id }).from(customFields).where(and(eq(customFields.tenantId, req.ctx.tenantId), eq(customFields.id, id)));
      if (!f) throw notFound('Custom field');
      await tx.delete(customFieldOptions).where(eq(customFieldOptions.fieldId, id));
      if (options.length) await tx.insert(customFieldOptions).values(options.map((o, i) => ({ ...o, fieldId: id, sortOrder: o.sortOrder ?? i })));
      return tx.select().from(customFieldOptions).where(eq(customFieldOptions.fieldId, id)).orderBy(asc(customFieldOptions.sortOrder));
    });
  });

  app.get('/custom-fields/:id/options', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return db.select().from(customFieldOptions).where(eq(customFieldOptions.fieldId, id)).orderBy(asc(customFieldOptions.sortOrder));
  });
}
