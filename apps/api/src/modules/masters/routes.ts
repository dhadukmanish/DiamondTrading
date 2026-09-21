import type { FastifyInstance } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { categorySchema, currencySchema, locationSchema, paymentTermSchema, salesPersonSchema, taxRateSchema, unitSchema } from '@erp/shared';
import { db } from '../../db/client';
import { categories, currencies, locations, paymentTerms, salesPersons, taxRates, units } from '../../db/schema/index';
import { crudRepository } from '../../lib/crud';
import { registerCrudRoutes } from '../../lib/crud-routes';

/** Simple masters share one CRUD implementation; only the table + schema differ. */
export async function masterRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, { prefix: '/currencies', module: 'currencies', schema: currencySchema,
    repo: crudRepository(currencies, { searchable: [currencies.code, currencies.name], defaultSort: 'code' }) });
  registerCrudRoutes(app, { prefix: '/units', module: 'units', schema: unitSchema,
    repo: crudRepository(units, { searchable: [units.code, units.name], defaultSort: 'code' }) });
  registerCrudRoutes(app, { prefix: '/tax-rates', module: 'tax_rates', schema: taxRateSchema,
    repo: crudRepository(taxRates, { searchable: [taxRates.name], defaultSort: 'rate' }) });
  registerCrudRoutes(app, { prefix: '/categories', module: 'categories', schema: categorySchema,
    repo: crudRepository(categories, { searchable: [categories.name], defaultSort: 'name' }) });
  registerCrudRoutes(app, { prefix: '/sales-persons', module: 'sales_persons', schema: salesPersonSchema,
    repo: crudRepository(salesPersons, { searchable: [salesPersons.name, salesPersons.email], defaultSort: 'name' }) });
  registerCrudRoutes(app, { prefix: '/locations', module: 'locations', schema: locationSchema,
    repo: crudRepository(locations, { searchable: [locations.name, locations.code], defaultSort: 'name' }) });

  const termRepo = crudRepository(paymentTerms, { searchable: [paymentTerms.name], defaultSort: 'days' });
  registerCrudRoutes(app, { prefix: '/payment-terms', module: 'payment_terms', schema: paymentTermSchema, repo: termRepo });

  // "Configure Payment Terms" modal saves the whole list at once; one default only.
  app.put('/payment-terms', { preHandler: app.authorize('payment_terms.update') }, async (req) => {
    const list = paymentTermSchema.extend({ id: z.string().uuid().optional() }).array().parse(req.body);
    return db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const t of list) {
        const [row] = t.id
          ? await tx.update(paymentTerms).set({ name: t.name, days: t.days, isDefault: t.isDefault, updatedAt: new Date() })
              .where(and(eq(paymentTerms.tenantId, req.ctx.tenantId), eq(paymentTerms.id, t.id))).returning({ id: paymentTerms.id })
          : await tx.insert(paymentTerms).values({ tenantId: req.ctx.tenantId, name: t.name, days: t.days, isDefault: t.isDefault }).returning({ id: paymentTerms.id });
        if (row) ids.push(row.id);
      }
      const def = list.find((t: { isDefault: boolean }) => t.isDefault);
      if (def) {
        const defId = ids[list.indexOf(def)]!;
        await tx.update(paymentTerms).set({ isDefault: false }).where(and(eq(paymentTerms.tenantId, req.ctx.tenantId), ne(paymentTerms.id, defId)));
      }
      return tx.select().from(paymentTerms).where(eq(paymentTerms.tenantId, req.ctx.tenantId)).orderBy(paymentTerms.days);
    });
  });
}
