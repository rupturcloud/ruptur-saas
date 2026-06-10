// getnet-channel-probe.mjs
// Testa o header obrigatório x-transaction-channel-entry no path de pagamento CONHECIDO.
// Se status != 403 => o valor do channel foi aceito (passou do WAF/gateway).

const clientId = process.env.GETNET_HOMOLOG_CLIENT_ID;
const clientSecret = process.env.GETNET_HOMOLOG_CLIENT_SECRET;
const sellerId = process.env.GETNET_HOMOLOG_SELLER_ID;
const baseUrl = process.env.GETNET_HOMOLOG_BASE_URL || 'https://api.pre.globalgetnet.com';

const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
const tokenRes = await fetch(`${baseUrl}/authentication/oauth2/access_token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
const token = (await tokenRes.json()).access_token;
console.log(JSON.stringify({ tokenOk: !!token }));
if (!token) process.exit(1);

const PAYMENT_PATH = '/dpm/payments-gwproxy/v2/payments';
const channels = ['ECOMMERCE', 'ECOM', 'E-COMMERCE', 'ECOMMERCE_WEB', 'WEB', 'INTERNET', 'MOTO', 'CARD_NOT_PRESENT', '01', '02', '03', '10'];

const body = JSON.stringify({
  request_id: 'probe-001',
  order_id: 'probe-order-001',
  data: { amount: 100, currency: 'BRL', customer_id: 'homolog-customer-001' },
});

// baseline: sem o header (espera 403)
{
  const res = await fetch(`${baseUrl}${PAYMENT_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-seller-id': sellerId },
    body,
  });
  console.log(`baseline(sem channel): ${res.status}`);
}

for (const ch of channels) {
  try {
    const res = await fetch(`${baseUrl}${PAYMENT_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-seller-id': sellerId,
        'x-transaction-channel-entry': ch,
      },
      body,
    });
    const text = await res.text();
    const got = ![403].includes(res.status);
    console.log(`${got ? '>>>' : '   '} ${res.status} channel="${ch}" ${got ? text.slice(0, 220) : ''}`);
  } catch (e) {
    console.log(`ERR channel="${ch}" ${String(e).slice(0, 80)}`);
  }
}
console.log('== fim ==');
