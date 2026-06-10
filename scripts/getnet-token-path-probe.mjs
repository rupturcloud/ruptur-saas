// getnet-token-path-probe.mjs
// Descobre o endpoint de tokenização do V2 Global testando candidatos com Bearer token válido.
// Status 403/404 = path errado; 200/400/422 = path existe.

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
const tokenData = await tokenRes.json();
const token = tokenData.access_token;
console.log(JSON.stringify({ tokenOk: !!token, sellerIdLen: (sellerId || '').length }));
if (!token) { console.log('NO TOKEN — abort'); process.exit(1); }

const candidates = [
  '/dpm/payments-gwproxy/v2/tokens/card',
  '/dpm/payments-gwproxy/v2/tokens',
  '/dpm/payments-gwproxy/v2/cards/tokenize',
  '/dpm/payments-gwproxy/v2/number-tokenization',
  '/dpm/payments-gwproxy/v2/tokenization',
  '/dpm/vault-gwproxy/v2/tokens',
  '/dpm/tokenization-gwproxy/v2/tokens',
  '/dpm/payments-gwproxy/v2/cards/number-token',
];

const card_number = '5155901222280001';
const customer_id = 'homolog-customer-001';

// tenta dois formatos de body por path: flat e aninhado (data:{})
const bodies = [
  { tag: 'flat', json: { card_number, customer_id } },
  { tag: 'nested', json: { request_id: 'probe', data: { card_number, customer_id } } },
];

for (const path of candidates) {
  for (const b of bodies) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-seller-id': sellerId,
          'seller_id': sellerId,
        },
        body: JSON.stringify(b.json),
      });
      const text = await res.text();
      const interesting = ![403, 404].includes(res.status);
      console.log(`${interesting ? '>>>' : '   '} ${res.status} ${path} [${b.tag}] ${interesting ? text.slice(0, 180) : ''}`);
      if (interesting && b.tag === 'flat') break; // achou o path, não precisa testar nested
    } catch (e) {
      console.log(`ERR ${path} [${b.tag}] ${String(e).slice(0, 80)}`);
    }
  }
}
console.log('== fim ==');
