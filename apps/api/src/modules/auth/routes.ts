import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@erp/shared';
import { buildAuthUser, login } from './service';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req) => {
    const user = await login(loginSchema.parse(req.body));
    return { token: app.jwt.sign(user), user };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => buildAuthUser(req.user.id));
}
