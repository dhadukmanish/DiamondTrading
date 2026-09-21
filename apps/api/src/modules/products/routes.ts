import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { idParam, listQuerySchema, productSchema } from '@erp/shared';
import { db } from '../../db/client';
import { products } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { getProduct, listProducts, saveProduct, searchVariants } from './service';

export async function productRoutes(app: FastifyInstance) {
  app.get('/products', { preHandler: app.authorize('products.view') }, async (req) => listProducts(req.ctx, listQuerySchema.parse(req.query)));
  app.get('/products/search', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ term: z.string().optional(), stockType: z.string().optional() }).parse(req.query);
    return searchVariants(req.ctx, q.term, q.stockType);
  });
  app.get('/products/:id', { preHandler: app.authorize('products.view') }, async (req) => getProduct(req.ctx, idParam.parse(req.params).id));
  app.post('/products', { preHandler: app.authorize('products.create') }, async (req, reply) => reply.code(201).send(await saveProduct(req.ctx, productSchema.parse(req.body))));
  app.put('/products/:id', { preHandler: app.authorize('products.update') }, async (req) => saveProduct(req.ctx, productSchema.parse(req.body), idParam.parse(req.params).id));
  app.delete('/products/:id', { preHandler: app.authorize('products.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [r] = await db.delete(products).where(and(eq(products.tenantId, req.ctx.tenantId), eq(products.id, id))).returning({ id: products.id });
    if (!r) throw notFound('Product');
    return reply.code(204).send();
  });
}
