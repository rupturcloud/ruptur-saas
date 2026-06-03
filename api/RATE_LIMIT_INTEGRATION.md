# Integração do Rate Limiter por Tenant no Gateway

## Import

Adicionar no topo de `gateway.mjs`, junto aos outros imports:

```js
import { rateLimitTenant, isExemptRoute } from './modules/rate-limiter/tenant-rate-limiter.js';
```

## Ponto de Integração

Logo após o bloco `extractAndValidateTenantId` / `extractUser`, **antes** de processar a request.
Inserir após a linha `const user = await extractUser(req);` (por volta da linha 696 no gateway):

```js
// Rate Limiter por tenant — bloqueia uso abusivo independente do IP
if (user?.tenantId && !isExemptRoute(pathname)) {
  const rl = rateLimitTenant(user.tenantId, user.tenantPlan || 'trial');
  if (!rl.allowed) {
    log('warn', 'Rate limit por tenant excedido', {
      tenantId: user.tenantId,
      plan: user.tenantPlan,
    });
    res.writeHead(429, {
      'Retry-After': '60',
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': String(rl.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.floor(rl.resetAt.getTime() / 1000)),
    });
    return res.end(JSON.stringify({ error: 'Rate limit por tenant excedido' }));
  }
}
```

## Rotas Isentas (automático via isExemptRoute)

- `/api/health` — health check
- `/api/webhooks/*` — webhooks recebidos (Mercado Pago, etc.)
- `/api/inbox/sse/*` — Server-Sent Events

## Limites por Plano

| Plano    | req/min | req/seg equivalente |
|----------|---------|---------------------|
| trial    | 60      | 1/seg               |
| starter  | 300     | 5/seg               |
| pro      | 600     | 10/seg              |
| business | 1200    | 20/seg              |
| custom   | ∞       | sem limite          |

Planos desconhecidos recebem o limite de `trial` como fallback seguro.

## Campo tenantPlan

O campo `plan` existe no objeto tenant retornado por `getTenantAccessList` (campo `plan` da tabela `tenants`).
Para expô-lo no objeto `user` durante a request, adicionar em `extractAndValidateTenantId` ou passar
diretamente: `user.tenantPlan = tenant.plan`.

## Módulo

`api/modules/rate-limiter/tenant-rate-limiter.js`

Exports:
- `rateLimitTenant(tenantId, plan)` → `{ allowed, remaining, resetAt, limit }`
- `getRateLimitHeaders(tenantId, plan)` → headers prontos para `res.writeHead`
- `isExemptRoute(pathname)` → boolean
- `PLAN_LIMITS` — objeto com os limites por plano
- `WINDOW_MS` — duração da janela em ms (60000)
