import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { contactSchema, idParam, listQuerySchema } from '@erp/shared';
import { db } from '../../db/client';
import { contacts } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { getContact, listContacts, peekSerial, saveContact, searchContacts } from './service';

export async function contactRoutes(app: FastifyInstance) {
  app.get('/contacts', { preHandler: app.authorize('contacts.view') }, async (req) => listContacts(req.ctx, listQuerySchema.parse(req.query)));
  app.get('/contacts/next-serial', { preHandler: app.authorize('contacts.view') }, async (req) => ({ serialNo: await peekSerial(req.ctx) }));
  app.get('/contacts/search', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ type: z.enum(['customer', 'vendor', 'broker', 'all']).default('all'), term: z.string().optional() }).parse(req.query);
    return searchContacts(req.ctx, q.type, q.term);
  });
  app.get('/contacts/:id', { preHandler: app.authorize('contacts.view') }, async (req) => getContact(req.ctx, idParam.parse(req.params).id));
  app.post('/contacts', { preHandler: app.authorize('contacts.create') }, async (req, reply) => reply.code(201).send(await saveContact(req.ctx, contactSchema.parse(req.body))));
  app.put('/contacts/:id', { preHandler: app.authorize('contacts.update') }, async (req) => saveContact(req.ctx, contactSchema.parse(req.body), idParam.parse(req.params).id));
  app.delete('/contacts/:id', { preHandler: app.authorize('contacts.delete') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [r] = await db.delete(contacts).where(and(eq(contacts.tenantId, req.ctx.tenantId), eq(contacts.id, id))).returning({ id: contacts.id });
    if (!r) throw notFound('Contact');
    return reply.code(204).send();
  });
}
