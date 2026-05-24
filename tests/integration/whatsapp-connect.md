# Teste manual: fluxo QR connect

## Pré-requisito

- `UAZAPI_FREE_ADMIN_TOKEN` válido (expira em 1h) em `.env`
- Servidor rodando localmente: `npm run dev` (ou `node server.js`)
- `TENANT_ID` de um tenant de teste com conta ativa no Supabase

## Variáveis de ambiente necessárias

```
UAZAPI_FREE_ADMIN_TOKEN=<token-admin-de-1h>
SUPABASE_URL=<url>
SUPABASE_SERVICE_KEY=<chave>
```

---

## Passos

### 1. Criar instância (POST /api/v1/whatsapp/numbers)

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/numbers \
  -H "Authorization: Bearer <JWT_DO_TENANT>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Teste QR"}'
```

**Resposta esperada:**
```json
{
  "id": "uuid-da-instância-no-banco",
  "name": "Teste QR",
  "status": "connecting",
  "phone": null
}
```

Guarde o `id` retornado — será usado nas próximas chamadas.

---

### 2. Conectar e obter QR (POST /api/v1/whatsapp/numbers/:id/connect)

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/numbers/<ID>/connect \
  -H "Authorization: Bearer <JWT_DO_TENANT>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Resposta esperada:**
```json
{
  "id": "<ID>",
  "status": "PENDING",
  "qrCode": "data:image/png;base64,iVBORw0KGg...",
  "pairingCode": null,
  "mode": "qr"
}
```

- `qrCode` deve ser uma data URL `data:image/png;base64,...`
- `pairingCode` será null para fluxo QR (sem campo `phone`)
- `status` deve ser `"PENDING"` (instância ainda não autenticada)

> **Alternativa: pairing code**
> Enviar `{"phone": "5511999999999"}` para receber `pairingCode` em vez de `qrCode`.

---

### 3. Escanear QR com WhatsApp

1. Abrir o WhatsApp no celular
2. Ir em: Configurações → Aparelhos Conectados → Conectar Aparelho
3. Escanear o QR code da resposta anterior
4. Aguardar entre 5–15 segundos para a conexão ser estabelecida

---

### 4. Verificar status após scan (GET /api/v1/whatsapp/numbers/:id/status)

```bash
curl http://localhost:3000/api/v1/whatsapp/numbers/<ID>/status \
  -H "Authorization: Bearer <JWT_DO_TENANT>"
```

**Resposta esperada após scan bem-sucedido:**
```json
{
  "id": "<ID>",
  "status": "connected",
  "phone": "5511999999999",
  "lastSeen": null
}
```

**Mapeamento de campos do spec UAZAPI para o response:**
- `status` ← `res.instance.status` (string: `"connected"` | `"disconnected"` | `"connecting"`)
- `phone`  ← `res.status.jid.user` (número sem @s.whatsapp.net)
- `lastSeen` ← `res.instance.lastDisconnect` (ISO 8601 ou null)

---

### 5. Verificar saúde (GET /api/v1/whatsapp/numbers/:id/health)

```bash
curl http://localhost:3000/api/v1/whatsapp/numbers/<ID>/health \
  -H "Authorization: Bearer <JWT_DO_TENANT>"
```

**Resposta esperada:**
```json
{
  "id": "<ID>",
  "uptime": null,
  "msgsToday": null,
  "deliveryRate": null,
  "score": null
}
```

> O servidor free do UAZAPI não expõe métricas de uptime/deliveryRate via `/instance/status`.
> Todos os campos serão `null` no free tier — comportamento esperado.

---

## Diagnóstico de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `qrCode: null` | Instância já conectada ou erro no UAZAPI | Checar logs do servidor; tentar disconnect + reconnect |
| `status: "disconnected"` após scan | Token admin expirou (1h no free) | Gerar novo admintoken e recriar a instância |
| `status: "connecting"` nunca avança | QR expirou (timeout 2 min) | Chamar `/connect` novamente para gerar novo QR |
| `401` na chamada de connect | `remote_instance_id` no banco não é o `token` UAZAPI | Verificar se `createInstance` salvou `providerId` (não `id` UUID) em `remote_instance_id` |
| `phone: null` após conectar | `jid` não propagado ainda | Aguardar 10s e fazer poll em `/status` novamente |

---

## Comportamento interno (para referência)

### createInstance() — campos do response UAZAPI
```
POST /instance/create (admintoken header)
→ { token: "<instanceToken>", instance: { id, token, status, ... }, connected, loggedIn, name, info }

Adapter mapeia:
  providerId    = res.token || res.instance.token   ← salvo em remote_instance_id
  internalId    = res.id   || res.instance.id       ← salvo em metadata.provider.internalId (só log)
```

### startSession() — campos do response UAZAPI
```
POST /instance/connect (token header)
→ { connected: bool, loggedIn: bool, jid: null, instance: { qrcode, paircode, status, ... } }

Adapter mapeia:
  qrCode      = res.instance.qrcode      ← data URL base64
  pairingCode = res.instance.paircode    ← código alfanumérico (ex: "ABC-DEF")
  status      = "PENDING" (connected=false, loggedIn=false antes do scan)
```

### getStatus() — campos do response UAZAPI
```
GET /instance/status (token header)
→ { instance: { status: "connected", owner: "5511...", lastDisconnect, ... },
    status:   { connected: true, loggedIn: true, jid: { user: "5511...", server: "s.whatsapp.net" } } }

Adapter mapeia:
  status   = res.instance.status           ← texto "connected" (NÃO res.status — esse é um objeto)
  phone    = res.status.jid.user           ← NÃO res.status.status.jid.user (bug corrigido)
  lastSeen = res.instance.lastDisconnect   ← null quando conectado
```
