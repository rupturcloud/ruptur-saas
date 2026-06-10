// getnet-method-test.mjs
// Valida o método createV2GlobalCreditPayment (estrutura V2 Global via apiFetch + x-seller-id).
// Esperado (com seller ainda não provisionado): chega ao adquirente com "seller not found".
// Quando o seller for provisionado: deve retornar APPROVED.

import { BillingService } from '../modules/billing/getnet.js';

const billing = new BillingService({ useHomolog: true });
console.log('seller:', billing.sellerId);
console.log('base  :', billing.baseUrl);

try {
  const res = await billing.createV2GlobalCreditPayment({
    amountCents: 100,
    card: { number: '5155901222280001', expMonth: '12', expYear: '26', holderName: 'TESTE HOMOLOG', cvv: '123' },
    customerId: 'homolog-customer-001',
  });
  console.log('>>> SUCCESS (APPROVED?):', JSON.stringify(res).slice(0, 500));
} catch (e) {
  console.log('status:', e.status);
  console.log('message:', e.message);
  console.log('body:', JSON.stringify(e.body).slice(0, 600));
}
