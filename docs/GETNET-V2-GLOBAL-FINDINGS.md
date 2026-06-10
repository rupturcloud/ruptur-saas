# Getnet V2 Global (Santander) — Homologação: achados validados

> Ambiente: `https://api.pre.globalgetnet.com` (pre/homolog). Validado 2026-06-05 via probes no container `saas-web` (VM, IAP).

## ✅ OAuth2 — RESOLVIDO e validado

- **URL correta**: `POST /authentication/oauth2/access_token` (a antiga `/auth/oauth/v2/token` é da Getnet BR).
- **client_id MANTÉM o prefixo `cid_`/`CID`** (40 chars) — NÃO remover (confirmado pela Gabriela/Getnet).
- **SEM `scope`** no body — V2 Global rejeita `scope=oob` com `invalid_scope`. Usar só `grant_type=client_credentials`.
- Resultado: HTTP 200, Bearer token, `expires_in: 3599`.
- **Mito do 403 Akamai derrubado**: nunca foi bloqueio de IP — era o **path errado**. O IP da VM nunca precisou de whitelist.

Correções já aplicadas em `modules/billing/getnet.js` (condicionais a `useHomolog`): tokenPath, basicClientId (sem strip), body sem scope.

## ✅ Endpoint de pagamento — mapeado e estrutura validada

- **`POST /dpm/payments-gwproxy/v2/payments`** (alcançável: retorna 422/400 com body inválido, não 403).
- Headers: `Authorization: Bearer`, `Content-Type: application/json`, `x-seller-id: <seller_uuid>`.
  - `x-transaction-channel-entry` **NÃO é obrigatório** pro gateway (baseline sem ele deu 422, não 403).
- **Body V2 Global** (diferente da doc e MUITO diferente da Getnet BR):
  ```json
  {
    "idempotency_key": "uuid", "request_id": "uuid", "order_id": "string",
    "data": {
      "amount": 100, "currency": "BRL", "customer_id": "string",
      "payment": {
        "payment_method": "CREDIT", "transaction_type": "FULL",
        "number_installments": 1, "soft_descriptor": "RUPTUR",
        "card": { "number": "5155901222280001", "expiration_month": "12",
                  "expiration_year": "26", "cardholder_name": "...", "security_code": "123" }
      },
      "additional_data": { "device": { "ip_address": "...", "device_id": "uuid", "finger_print": "..." } }
    }
  }
  ```
  - ⚠️ `data.customer` (objeto) **NÃO é permitido** — só `data.customer_id`.
  - ⚠️ `expiration_year` deve ter **2 chars** ("26", não "2026").
- Pode-se enviar `card.number` cru (cartão de teste homolog) — **não precisa tokenizar** para o teste.

## ⏳ BLOCKER externo restante — provisionamento do seller

- Com body válido, a transação chega ao adquirente e retorna:
  `PAYMENTS-999 DENIED — "The seller informed was not found"` (reason_code 001).
- O `seller_id` informado (`GETNET_HOMOLOG_SELLER_ID` = `30a4dc7f-582d-461a-9d9f-6eceb95e7ea1`) **não está cadastrado/ativo no ambiente pre/homolog**.
- **Ação Getnet (Gabriela)**: provisionar/confirmar o seller_id no ambiente de homologação, OU informar o seller_id correto de homolog.

## Tokenização

- Paths candidatos (`/dpm/.../tokens`, `/tokens/card`, `/cards/tokenize`, etc.) todos 403 (rota inexistente). Path real não está na doc pública.
- Para homologação de cartão, usar `card.number` direto resolve. Tokenização pode ser endereçada depois (perguntar path à Getnet se necessário para PCI).

## Cartões de teste (V2 Global)

- Aprovado: `5155901222280001`
- Negado: `5155901222280050`

## Scripts de probe (em `scripts/`, rodar no container via `docker exec saas-web node scripts/<x>.mjs`)

- `getnet-oauth-probe.mjs` — valida OAuth
- `getnet-payment-probe.mjs` — testa pagamento V2 Global completo
- `getnet-channel-probe.mjs` / `getnet-token-path-probe.mjs` — descoberta de header/paths
