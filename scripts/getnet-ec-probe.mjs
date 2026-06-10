// getnet-ec-probe.mjs — testa se o "seller not found" se resolve usando o EC code (HTI) no x-seller-id.
const clientId = process.env.GETNET_HOMOLOG_CLIENT_ID;
const clientSecret = process.env.GETNET_HOMOLOG_CLIENT_SECRET;
const sellerUuid = process.env.GETNET_HOMOLOG_SELLER_ID;
const ecHti = process.env.GETNET_HOMOLOG_EC_HTI;
const baseUrl = process.env.GETNET_HOMOLOG_BASE_URL || 'https://api.pre.globalgetnet.com';

const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
const token = (await (await fetch(`${baseUrl}/authentication/oauth2/access_token`, {
  method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
})).json()).access_token;
const uuid = () => crypto.randomUUID();
console.log('UUID seller:', sellerUuid, '| EC_HTI:', ecHti);

const mkBody = () => JSON.stringify({
  idempotency_key: uuid(), request_id: uuid(), order_id: `ec-${Date.now()}`,
  data: { amount: 100, currency: 'BRL', customer_id: 'homolog-customer-001',
    payment: { payment_method: 'CREDIT', transaction_type: 'FULL', number_installments: 1, soft_descriptor: 'RUPTUR',
      card: { number: '5155901222280001', expiration_month: '12', expiration_year: '26', cardholder_name: 'TESTE HOMOLOG', security_code: '123' } },
    additional_data: { device: { ip_address: '177.10.10.10', device_id: uuid(), finger_print: 'fp' } } },
});

const trials = [
  { tag: 'x-seller-id = UUID (baseline)', seller: sellerUuid },
  { tag: 'x-seller-id = EC_HTI', seller: ecHti },
];
for (const t of trials) {
  try {
    const res = await fetch(`${baseUrl}/dpm/payments-gwproxy/v2/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-seller-id': t.seller, 'x-transaction-channel-entry': 'ECOMMERCE' },
      body: mkBody(),
    });
    const txt = await res.text();
    console.log(`\n== ${t.tag} ==`);
    console.log(res.status, txt.slice(0, 320));
  } catch (e) { console.log(`\n== ${t.tag} == ERR`, String(e).slice(0, 100)); }
}
