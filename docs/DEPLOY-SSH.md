# Deploy SSH — Ruptur Cloud

> ⚠️ **DOC ATUALIZADO 2026-05-21.** Versão anterior estava desatualizada — `deploy@ruptur.cloud:/app/ruptur-saas` NÃO funciona. Realidade está descrita abaixo.

## TL;DR — caminhos que funcionam HOJE

| Cenário | Comando |
|---|---|
| SSH na VM de prod (interativo) | `gcloud compute ssh ruptur-shipyard-01 --zone=southamerica-east1-b --tunnel-through-iap` |
| Rodar comando único na VM | `gcloud compute ssh ruptur-shipyard-01 --zone=southamerica-east1-b --tunnel-through-iap --command="<cmd>"` |
| Copiar arquivos pra VM | `gcloud compute scp --tunnel-through-iap --zone=southamerica-east1-b <local> ruptur-shipyard-01:<remote>` |
| Onde o SaaS roda | `/opt/ruptur/saas` na VM |

## Infraestrutura real (2026-05-21)

| Item | Valor real | O que o doc antigo dizia (errado) |
|---|---|---|
| Hostname VM | `ruptur-shipyard-01` | (não citado) |
| Projeto GCP | (descobrir com `gcloud config get project`) | — |
| Zona | `southamerica-east1-b` | — |
| Machine type | `e2-standard-4` | — |
| IP externo | `34.39.196.137` | — |
| IP interno | `10.42.0.2` | — |
| SSH :22 do IP externo | ❌ **firewall bloqueia** | "funciona via ssh -i ..." (errado) |
| DNS `ruptur.cloud` | resolve pro Cloudflare (`104.21.5.82`, `172.67.133.51`) | "aponta pro VPS" (errado — CF proxy) |
| Path do SaaS na VM | `/opt/ruptur/saas` | `/app/ruptur-saas` (errado) |
| User SSH (via IAP) | `diego` | `deploy` (não existe nesta VM) |

## Por que SSH direto :22 falha

`ruptur.cloud` está com **Cloudflare em modo proxy** (orange cloud) — todas as requests passam pelo CF, que não suporta SSH (porta 22). Conexão para o IP externo `34.39.196.137:22` também dá timeout porque o firewall da VM (Identity-Aware Proxy) só aceita conexões via Google IAP.

A única forma de SSH é via `gcloud compute ssh --tunnel-through-iap`, que abre um tunnel TCP através do IAP do Google.

## Pré-requisitos no Mac do Diego

```bash
# Validar gcloud instalado e autenticado
gcloud --version              # ≥ 565.0.0
gcloud auth list              # ruptur.cloud@gmail.com ativo
gcloud config get project     # confirmar projeto correto

# Listar VMs ativas
gcloud compute instances list
# Deve mostrar:
# ruptur-shipyard-01  southamerica-east1-b  RUNNING  34.39.196.137
```

## SSH interativo na VM

```bash
gcloud compute ssh ruptur-shipyard-01 \
  --zone=southamerica-east1-b \
  --tunnel-through-iap
```

## Comando único

```bash
gcloud compute ssh ruptur-shipyard-01 \
  --zone=southamerica-east1-b \
  --tunnel-through-iap \
  --command="cd /opt/ruptur/saas && git log -1 --oneline"
```

## Deploy manual via script local

Use o script `infra/scripts/deploy-iap.sh` — mesmo fluxo do CI, executável localmente:

```bash
# Da raiz do projeto:
./infra/scripts/deploy-iap.sh

# Para pular o build do frontend (se já foi feito):
SKIP_BUILD=1 ./infra/scripts/deploy-iap.sh

# Com Slack:
SLACK_WEBHOOK="https://hooks.slack.com/..." ./infra/scripts/deploy-iap.sh
```

O script faz: build frontend → empacota → `gcloud compute scp --tunnel-through-iap` → na VM: backup → extract → `npm ci --omit=dev` → `docker compose up -d saas-web` → health check → smoke test.

## CI / GitHub Actions — status: **CORRIGIDO**

O workflow antigo `.github/workflows/deploy-rsync.yml` tentava SSH direto (bloqueado pelo CF). Foi criado `.github/workflows/deploy.yml` usando `google-github-actions/auth` + `gcloud compute scp/ssh --tunnel-through-iap`.

### Novo workflow: `.github/workflows/deploy.yml`

Dispara em `push` para:
- `main`
- `claude/fervent-bardeen-ee722e`

Fluxo:
1. Build do frontend (`web/client-area` via Vite)
2. Autentica no GCP via service account (secret `GCP_SA_KEY`)
3. Empacota source em `.tar.gz` (exclui `node_modules`, `.env`, `dist`, etc.)
4. Copia para VM via `gcloud compute scp --tunnel-through-iap`
5. Na VM: backup → extract → `npm ci --omit=dev` → `docker compose up -d saas-web` → health check interno
6. Smoke test externo: `https://app.ruptur.cloud/api/local/health`
7. Notificação Slack (opcional)

### Secrets obrigatórios no GitHub

Vá em: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valor | Como obter |
|---|---|---|
| `GCP_SA_KEY` | JSON completo da service account | Ver seção abaixo |
| `GCP_PROJECT_ID` | `ruptur-jarvis-v1-68358` | `gcloud config get project` |
| `SLACK_WEBHOOK` | URL do webhook Slack | Opcional — notificações de deploy |

### Criar service account para CI/CD

```bash
# 1) Criar a service account
gcloud iam service-accounts create github-actions-deploy \
  --display-name="GitHub Actions Deploy" \
  --project=ruptur-jarvis-v1-68358

# 2) Conceder roles necessárias
SA_EMAIL="github-actions-deploy@ruptur-jarvis-v1-68358.iam.gserviceaccount.com"

# Acesso via IAP tunnel (obrigatório)
gcloud projects add-iam-policy-binding ruptur-jarvis-v1-68358 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iap.tunnelResourceAccessor"

# Administrar instâncias Compute (obrigatório para gcloud compute ssh/scp)
gcloud projects add-iam-policy-binding ruptur-jarvis-v1-68358 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/compute.instanceAdmin.v1"

# Conta de serviço pode autenticar como ela mesma
gcloud projects add-iam-policy-binding ruptur-jarvis-v1-68358 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# 3) Gerar chave JSON e copiar o conteúdo para o secret GCP_SA_KEY
gcloud iam service-accounts keys create /tmp/github-actions-key.json \
  --iam-account="${SA_EMAIL}"

cat /tmp/github-actions-key.json
# Cole o JSON inteiro como valor do secret GCP_SA_KEY no GitHub

# 4) Remover arquivo local após copiar
rm /tmp/github-actions-key.json
```

> **Segurança:** a chave JSON dá acesso à VM via IAP. Nunca commite — use sempre como secret do GitHub Actions.

## Chave SSH `ruptur_deploy_ci`

Mantida pra uso futuro quando o deploy CI for corrigido, OU pra eventual VM sem IAP. **Hoje não tem efeito prático.**

- **Algoritmo:** ed25519 (sem passphrase)
- **Fingerprint:** `SHA256:xAbRt27jfWqhh2+jQ1W4eLLft82HjLaQ4cLdMWrtBK8`
- **Local:** `~/.ssh/ruptur_deploy_ci` (Mac do Diego) + secret `DEPLOY_SSH_KEY` no repo `rupturcloud/hitl-automation-engine`

### Re-plantar chave pública num user `deploy` (quando criar)

```bash
PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEbkvIuXzhMlyQ35VEOKzEneXq2rgjN8TSar3ZAkkDU8 ruptur-deploy-ci@github-actions"

gcloud compute ssh ruptur-shipyard-01 \
  --zone=southamerica-east1-b \
  --tunnel-through-iap \
  --command="
    sudo useradd -m -s /bin/bash deploy 2>/dev/null || true
    sudo mkdir -p /home/deploy/.ssh
    echo '$PUBKEY' | sudo tee -a /home/deploy/.ssh/authorized_keys
    sudo chown -R deploy:deploy /home/deploy/.ssh
    sudo chmod 700 /home/deploy/.ssh
    sudo chmod 600 /home/deploy/.ssh/authorized_keys
  "
```

### Revogar (se vazar)

```bash
# 1) Apagar a linha do authorized_keys
gcloud compute ssh ruptur-shipyard-01 \
  --zone=southamerica-east1-b --tunnel-through-iap \
  --command="sudo sed -i.bak '/ruptur-deploy-ci@github-actions/d' /home/deploy/.ssh/authorized_keys"

# 2) Apagar secret no GitHub
gh secret delete DEPLOY_SSH_KEY --repo rupturcloud/hitl-automation-engine

# 3) Apagar local
rm ~/.ssh/ruptur_deploy_ci ~/.ssh/ruptur_deploy_ci.pub

# 4) Gerar novo par
ssh-keygen -t ed25519 -f ~/.ssh/ruptur_deploy_ci -N "" -C "ruptur-deploy-ci@github-actions"
```

## Próximos passos recomendados

1. Adicionar secrets no GitHub: `GCP_SA_KEY`, `GCP_PROJECT_ID` (e opcionalmente `SLACK_WEBHOOK`)
2. Fazer push para `main` ou `claude/fervent-bardeen-ee722e` para acionar o novo workflow
3. Acompanhar execução em: **Actions** → **Deploy to Production**
4. Verificar saúde: `https://app.ruptur.cloud/api/local/health`
