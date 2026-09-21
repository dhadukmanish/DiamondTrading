import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AuthUser } from '@erp/shared';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { hasPermission, type Ctx } from '../lib/context';

declare module 'fastify' {
  interface FastifyRequest { ctx: Ctx }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    authorize: (perm: string) => preHandlerHookHandler;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT { payload: AuthUser; user: AuthUser }
}

export default fp(async (app) => {
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: '12h' } });

  const authenticate = async (req: FastifyRequest, _reply: FastifyReply) => {
    try { await req.jwtVerify(); } catch { throw unauthorized('Invalid or expired token'); }
    req.ctx = { tenantId: req.user.tenantId, userId: req.user.id, user: req.user };
  };

  app.decorate('authenticate', authenticate);
  app.decorate('authorize', (perm: string) => async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply);
    if (!hasPermission(req.user, perm)) throw forbidden(`Missing permission: ${perm}`);
  });
});
