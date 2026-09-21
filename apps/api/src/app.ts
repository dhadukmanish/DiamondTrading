import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import authPlugin from './plugins/auth';
import errorsPlugin from './plugins/errors';
import { authRoutes } from './modules/auth/routes';
import { orgRoutes } from './modules/org/firms';
import { userRoutes } from './modules/org/users';
import { masterRoutes } from './modules/masters/routes';
import { seriesRoutes } from './modules/series/routes';
import { customFieldRoutes } from './modules/custom-fields/routes';
import { contactRoutes } from './modules/contacts/routes';
import { accountRoutes } from './modules/accounts/routes';
import { productRoutes } from './modules/products/routes';
import { adjustmentRoutes } from './modules/inventory/adjustments';
import { transferRoutes } from './modules/inventory/transfers';
import { stockViewRoutes } from './modules/inventory/stock-view';
import { purchaseOrderRoutes } from './modules/purchase/orders';
import { purchaseBillRoutes } from './modules/purchase/bills';
import { vendorPaymentRoutes } from './modules/purchase/payments';
import { salesOrderRoutes } from './modules/sales/orders';
import { invoiceRoutes } from './modules/sales/invoices';

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });
  await app.register(cors, { origin: env.CORS_ORIGIN.split(','), credentials: true });
  await app.register(errorsPlugin);
  await app.register(authPlugin);

  app.get('/health', async () => ({ ok: true }));

  await app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(orgRoutes);
    await api.register(userRoutes);
    await api.register(masterRoutes);
    await api.register(seriesRoutes);
    await api.register(customFieldRoutes);
    await api.register(contactRoutes);
    await api.register(accountRoutes);
    await api.register(productRoutes);
    await api.register(adjustmentRoutes);
    await api.register(transferRoutes);
    await api.register(stockViewRoutes);
    await api.register(purchaseOrderRoutes);
    await api.register(purchaseBillRoutes);
    await api.register(vendorPaymentRoutes);
    await api.register(salesOrderRoutes);
    await api.register(invoiceRoutes);
  }, { prefix: '/api' });

  return app;
}
