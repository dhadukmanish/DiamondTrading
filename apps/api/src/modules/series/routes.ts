import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { docTypes, documentSeriesSchema } from '@erp/shared';
import { documentSeries } from '../../db/schema/index';
import { crudRepository } from '../../lib/crud';
import { registerCrudRoutes } from '../../lib/crud-routes';
import { preview, seriesFor } from './service';

export async function seriesRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, { prefix: '/document-series', module: 'document_series', schema: documentSeriesSchema,
    repo: crudRepository(documentSeries, { searchable: [documentSeries.prefix, documentSeries.docType], defaultSort: 'docType' }) });

  app.get('/document-series/for', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ docType: z.enum(docTypes), firmId: z.string().uuid(), branchId: z.string().uuid().optional() }).parse(req.query);
    return seriesFor(req.ctx, q.docType, q.firmId, q.branchId);
  });

  app.get('/document-series/:id/preview', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { date } = z.object({ date: z.coerce.date().optional() }).parse(req.query);
    return preview(req.ctx, id, date);
  });

  app.get('/document-series/doc-types', { preHandler: app.authenticate }, async () => docTypes);
}
