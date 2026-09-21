import type { FastifyInstance } from 'fastify';
import { idParam, listQuerySchema, vendorPaymentSchema } from '@erp/shared';
import { db } from '../../db/client';
import { debitNotes, purchaseBills, vendorPaymentAdvanceApplications, vendorPaymentAllocations, vendorPayments } from '../../db/schema';
import { listDocuments } from '../../lib/documents';
import { decorate } from '../../lib/party-doc';
import { availableAdvances, createPayment, getPayment, removePayment, type PaymentConfig } from '../../lib/payments-engine';

const CFG: PaymentConfig = {
  side: 'payable', sourceType: 'vendor_payment', payments: vendorPayments as never, allocations: vendorPaymentAllocations as never, advanceApps: vendorPaymentAdvanceApplications as never,
  primary: { table: purchaseBills as never, paidCol: 'paidAmount', type: 'purchase_bill' }, note: { table: debitNotes as never, paidCol: 'appliedAmount', type: 'debit_note' },
  inflowTypes: ['refund', 'debit_note_payment'], noteType: 'debit_note_payment', partyKey: 'accounts_payable', discountKey: 'discount_received', writeOffKey: 'write_off', withholdingKey: 'tds_payable',
};

export async function vendorPaymentRoutes(app: FastifyInstance) {
  app.get('/purchase/payments', { preHandler: app.authorize('vendor_payment.view') }, async (req) => { const p = await listDocuments(vendorPayments, req.ctx, listQuerySchema.parse(req.query)); return { ...p, rows: (await decorate(p.rows)).map((r) => ({ ...r, amount: Number(r.amount) })) }; });
  app.get('/purchase/payments/:id', { preHandler: app.authorize('vendor_payment.view') }, async (req) => getPayment(CFG, req.ctx, idParam.parse(req.params).id));
  app.post('/purchase/payments', { preHandler: app.authorize('vendor_payment.create') }, async (req, reply) => reply.code(201).send(await getPayment(CFG, req.ctx, await createPayment(CFG, req.ctx, vendorPaymentSchema.parse(req.body)))));
  app.delete('/purchase/payments/:id', { preHandler: app.authorize('vendor_payment.delete') }, async (req, reply) => { await removePayment(CFG, req.ctx, idParam.parse(req.params).id); return reply.code(204).send(); });
  app.get('/purchase/payments/advances/:contactId', { preHandler: app.authorize('vendor_payment.view') }, async (req) => {
    const list = await availableAdvances(CFG, db as never, req.ctx.tenantId, (req.params as { contactId: string }).contactId);
    return { total: Math.round(list.reduce((s, a) => s + a.available, 0) * 100) / 100, payments: list };
  });
}
