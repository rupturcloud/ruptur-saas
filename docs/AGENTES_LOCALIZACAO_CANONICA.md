# 📍 Localização Canônica — Instrução para TODOS os agentes

> **Leia antes de qualquer commit/push.** Se você está em local/remote/branch/repo
> diferente do descrito aqui, **ajuste-se a isto** antes de continuar sua demanda.
> Primazia inegociável: **nada quebrado, nada faltando, nada fora do lugar.**

---

## 1. Repositório canônico

```
rupturcloud/ruptur-saas
https://github.com/rupturcloud/ruptur-saas.git
```

- ❌ **NÃO** use `hitl-automation-engine` (repo errado, aposentado).
- ❌ **NÃO** crie repo novo. Este é o único destino do App/API/Front do SaaS.

Verifique o seu remote:
```bash
git remote get-url origin
# Deve retornar: https://github.com/rupturcloud/ruptur-saas.git
```
Se estiver errado:
```bash
git remote set-url origin https://github.com/rupturcloud/ruptur-saas.git
git fetch origin
```

## 2. Estratégia de branches

| Branch | Papel | Regra |
|---|---|---|
| `main` | **PRODUÇÃO** (deployada em ruptur.cloud) | Só recebe merge revisado. Não commitar direto. |
| `master` | **DEV** (trabalho ativo / débitos técnicos) | Branch padrão de trabalho. Commite aqui. |
| `legacy-main-2026-05` | Arquivo do `main` antigo (órfão, 2026-05-01) | **NÃO TOCAR.** Preservação histórica. |

> Trabalhe em **`master`**. Promova para `main` só via processo de release revisado.

## 3. Pasta local

```
/Users/diego/hitl/projects/tiatendeai/dev/x1-mercado-contingencia/saas
```
Worktrees em `.claude/worktrees/*` são temporários — o `git rev-parse --show-toplevel`
deve apontar para a pasta acima ou um worktree dela.

## 4. Mapa do SaaS (3 lugares — por design)

| Parte | Onde vive | Observação |
|---|---|---|
| App / API / Front | **`ruptur-saas`** (este repo) | Tudo que você edita normalmente |
| Runtime warmup / baileys / whisper | `tiatendeai/ruptur → deploy/host2` | Dependência externa. NÃO consolidar sem ordem explícita. |
| Banco | Supabase `axrwlboyowoskdxeogba` | Migrations em `migrations/NNN_*.sql` |

## 5. Deploy de produção

- VM: `ruptur-shipyard-01` (zona `southamerica-east1-b`), acesso **só via IAP**:
  ```bash
  gcloud compute ssh ruptur-shipyard-01 --zone=southamerica-east1-b --tunnel-through-iap
  ```
- App em `/opt/ruptur/saas`, container Docker `saas-web`.
- Migrations Supabase: aplicar via Management API (PAT) ou SQL Editor.

## 6. Gate de validação (obrigatório antes de commit — AGENTS.md)

```bash
npm run lint
npm test -- --runInBand
cd web/client-area && npm run build
```
Se o pre-commit hook barrar por erro **pré-existente**, corrija-o (não use --no-verify
para esconder regressão). Em emergência documentada, `--no-verify` + nota no commit.

## 7. Segredos

- `.env*` são **gitignored** — nunca commitar.
- Nunca colar segredo em chat/PR. Rotacionar os expostos (ver `docs/SECURITY_HARDENING_REPORT.md`).

---

## ⚠️ Pendência aberta (decisão do Diego)

`origin/main` (prod no git) está **atrás** do código deployado: o hardening de segurança
(commits `74c13c6`, `c92b24b`, `ef569c6`, migration 025) está em `master`/deployado na VM,
mas **não** foi promovido para `main`. Reconciliar `main` ← `master` é decisão de release
pendente. Até lá: **`master` é a fonte de verdade do código atual.**
