import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export default fp(async (app) => {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ code: 'VALIDATION', message: 'Validation failed', details: err.flatten() });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ code: err.code, message: err.message, details: err.details });
    }
    const fe = err as { statusCode?: number; code?: string; message: string };
    if (fe.statusCode && fe.statusCode < 500) return reply.code(fe.statusCode).send({ code: fe.code ?? 'ERROR', message: fe.message });
    // pg unique violation
    if ((err as { code?: string }).code === '23505') {
      return reply.code(409).send({ code: 'CONFLICT', message: 'A record with the same key already exists' });
    }
    app.log.error(err);
    return reply.code(500).send({ code: 'INTERNAL', message: 'Something went wrong' });
  });
});
