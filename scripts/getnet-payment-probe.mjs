// getnet-payment-probe.mjs
// Testa o pagamento V2 Global completo com cartão de teste (number cru, sem tokenizar).
// Mostra a resposta inteira pra entender status/validação.

const clientId = process.env.GETNET_HOMOLOG_CLIENT_ID;
const clientSecret = process.env.GETNET_HOMOLOG_CLIENT_SECRET;
const sellerId = process.env.GETNET_HOMOLOG_SELLER_ID;
const baseUrl = process.env.GETNET_HOMOLOG_BASE_URL || 'https://api.pre.globalgetnet.com';

const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
const token = (await (await fetch(`${baseUrl}/authentication/oauth2/access_token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
})).json()).access_token;
if (!token) { console.log('NO TOKEN'); process.exit(1); }

const uuid = () => crypto.randomUUID();

const payload = {
  idempotency_key: uuid(),
  request_id: uuid(),
  order_id: `homolog-${Date.now()}`,
  data: {
    amount: 100,
    currency: 'BRL',
    customer_id: 'homolog-customer-001',
    payment: {
      payment_method: 'CREDIT',
      save_card_data: false,
      transaction_type: 'FULL',
      number_installments: 1,
      soft_descriptor: 'RUPTUR',
      card: {
        number: '5155901222280001',
        expiration_month: '12',
        expiration_year: '26',
        cardholder_name: 'TESTE HOMOLOG',
        security_code: '123',
      },
    },
    additional_data: {
      device: { ip_address: '177.10.10.10', device_id: uuid(), finger_print: 'homolog-fp-001' },
    },
  },
};

const res = await fetch(`${baseUrl}/dpm/payments-gwproxy/v2/payments`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-seller-id': sellerId,
    'x-transaction-channel-entry': 'ECOMMERCE',
  },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
