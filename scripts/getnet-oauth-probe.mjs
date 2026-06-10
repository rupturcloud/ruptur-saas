// getnet-oauth-probe.mjs
// Testa o OAuth2 da Getnet V2 Global (homolog) com a URL corrigida pela Gabriela.
// Nunca imprime o secret nem o client_id completo — só prefixo e tamanho.
// Uso (dentro do container, env já carregada): node scripts/getnet-oauth-probe.mjs

const clientId = process.env.GETNET_HOMOLOG_CLIENT_ID;
const clientSecret = process.env.GETNET_HOMOLOG_CLIENT_SECRET;
const baseUrl = process.env.GETNET_HOMOLOG_BASE_URL || 'https://api.pre.globalgetnet.com';
const url = `${baseUrl}/authentication/oauth2/access_token`;

const meta = {
  url,
  hasClientId: !!clientId,
  hasClientSecret: !!clientSecret,
  clientIdPrefix: clientId ? clientId.slice(0, 4) : null,
  clientIdLen: clientId ? clientId.length : 0,
};
console.log('== probe meta ==');
console.log(JSON.stringify(meta, null, 2));

if (!clientId || !clientSecret) {
  console.log(JSON.stringify({ fatal: 'missing GETNET_HOMOLOG_CLIENT_ID/SECRET' }));
  process.exit(1);
}

const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const bodies = [
  'grant_type=client_credentials',
  'grant_type=client_credentials&scope=oob',
];

for (const body of bodies) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    console.log(`\n== body="${body}" ==`);
    console.log(JSON.stringify({
      status: res.status,
      ok: res.ok,
      gotToken: !!parsed?.access_token,
      tokenType: parsed?.token_type,
      expiresIn: parsed?.expires_in,
      server: res.headers.get('server'),
      bodyPreview: res.ok ? '[token omitido]' : text.slice(0, 500),
    }, null, 2));
    if (res.ok && parsed?.access_token) {
      console.log('\n>>> OAUTH OK <<<');
      break;
    }
  } catch (e) {
    console.log(`\n== body="${body}" FETCH ERROR ==`);
    console.log(String(e));
  }
}
