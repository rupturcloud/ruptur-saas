#!/usr/bin/env bash
# Ruptur SaaS — Deploy manual via gcloud IAP
#
# Uso: ./infra/scripts/deploy-iap.sh
#
# Mesmo fluxo do CI (.github/workflows/deploy.yml), mas executável localmente.
# Pré-requisitos:
#   - gcloud CLI autenticado (gcloud auth login / gcloud auth application-default login)
#   - Permissões: roles/iap.tunnelResourceAccessor + roles/compute.instanceAdmin
#   - Build do frontend já feito: npm --prefix web/client-area run build
#
# Variáveis de ambiente (todas com defaults seguros para prod):
#   GCP_PROJECT   — projeto GCP       (default: ruptur-jarvis-v1-68358)
#   GCP_ZONE      — zona da VM        (default: southamerica-east1-b)
#   GCP_VM        — nome da VM        (default: ruptur-shipyard-01)
#   APP_PATH      — path na VM        (default: /opt/ruptur/saas)
#   ENVIRONMENT   — label do env      (default: production)
#   SKIP_BUILD    — "1" para pular build do frontend
#   SLACK_WEBHOOK — URL webhook Slack (opcional)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
log_success() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
log_error()   { echo -e "${RED}[DEPLOY]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[DEPLOY]${NC} $1"; }

# --- Configuração ---
GCP_PROJECT=${GCP_PROJECT:-ruptur-jarvis-v1-68358}
GCP_ZONE=${GCP_ZONE:-southamerica-east1-b}
GCP_VM=${GCP_VM:-ruptur-shipyard-01}
APP_PATH=${APP_PATH:-/opt/ruptur/saas}
ENVIRONMENT=${ENVIRONMENT:-production}
SKIP_BUILD=${SKIP_BUILD:-0}

BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "local")
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIMESTAMP=$(date +%Y%m%d-%H%M%S)

TAR_FILE="/tmp/ruptur-saas-deploy-${BUILD_TIMESTAMP}.tar.gz"
TAR_BASENAME="$(basename "$TAR_FILE")"

# Detectar raiz do repositório
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

main() {
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Ruptur SaaS — Deploy manual via IAP${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo -e "Branch:      ${YELLOW}${BRANCH_NAME}${NC}"
    echo -e "Commit:      ${YELLOW}${COMMIT_SHA}${NC}"
    echo -e "Timestamp:   ${YELLOW}${BUILD_TIMESTAMP}${NC}"
    echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
    echo -e "Destino:     ${YELLOW}${GCP_VM}:${APP_PATH}${NC}"
    echo -e "Projeto GCP: ${YELLOW}${GCP_PROJECT}${NC}"
    echo ""

    # Step 1: Verificar gcloud disponível e autenticado
    log_info "Verificando gcloud CLI..."
    if ! command -v gcloud &>/dev/null; then
        log_error "gcloud CLI não encontrado. Instale: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    log_success "gcloud: $(gcloud --version | head -1)"

    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
        log_error "Nenhuma conta gcloud ativa. Execute: gcloud auth login"
        exit 1
    fi
    log_success "Conta GCP ativa: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"

    # Step 2: Build do frontend (se não pulado)
    if [ "$SKIP_BUILD" != "1" ]; then
        log_info "Construindo frontend (web/client-area)..."
        if [ -d "${REPO_ROOT}/web/client-area" ]; then
            (cd "${REPO_ROOT}" && npm --prefix web/client-area run build)
            log_success "Build do frontend concluído"
        else
            log_warning "Diretório web/client-area não encontrado — pulando build"
        fi
    else
        log_warning "SKIP_BUILD=1 — build do frontend ignorado"
    fi

    # Step 3: Empacotar source
    log_info "Empacotando source para deploy..."
    (cd "${REPO_ROOT}" && tar czf "$TAR_FILE" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='.env' \
        --exclude='.env.*' \
        --exclude='runtime-data/warmup-state.json' \
        --exclude='runtime-data/instance-dna' \
        --exclude='.next' \
        --exclude='dist' \
        --exclude='artifacts' \
        --exclude='.DS_Store' \
        --exclude='backups' \
        --exclude='coverage' \
        --exclude='*.tar.gz' \
        .)
    log_success "Pacote criado: ${TAR_FILE} ($(du -sh "$TAR_FILE" | cut -f1))"

    # Step 4: Copiar pacote via IAP tunnel
    log_info "Copiando pacote para ${GCP_VM} via IAP..."
    gcloud compute scp \
        --tunnel-through-iap \
        --zone="$GCP_ZONE" \
        --project="$GCP_PROJECT" \
        "$TAR_FILE" \
        "${GCP_VM}:/tmp/"
    log_success "Pacote transferido"

    # Step 5: Extrair, instalar deps e reiniciar via SSH+IAP
    log_info "Aplicando deploy na VM (backup → extract → npm ci → docker restart)..."
    gcloud compute ssh "$GCP_VM" \
        --zone="$GCP_ZONE" \
        --project="$GCP_PROJECT" \
        --tunnel-through-iap \
        --command="
            set -e
            BACKUP_NAME=backup-\$(date +%Y%m%d-%H%M%S)
            cd ${APP_PATH}

            echo '[DEPLOY] Criando backup: '\$BACKUP_NAME
            mkdir -p backups
            tar czf backups/\${BACKUP_NAME}.tar.gz \
                --exclude=backups \
                --exclude=node_modules \
                . 2>/dev/null || echo '[DEPLOY] Aviso: backup parcial (ok na primeira vez)'

            echo '[DEPLOY] Extraindo pacote...'
            tar xzf /tmp/${TAR_BASENAME}

            echo '[DEPLOY] Instalando dependências de produção...'
            npm ci --omit=dev

            echo '[DEPLOY] Reiniciando container saas-web...'
            docker compose up -d saas-web

            echo '[DEPLOY] Aguardando container estabilizar...'
            sleep 10

            echo '[DEPLOY] Health check interno...'
            curl -sf http://localhost:3001/api/health | grep -q '\"ok\":true' \
                && echo '[DEPLOY] Health check OK' \
                || { echo '[DEPLOY] ERRO: health check falhou'; exit 1; }

            rm -f /tmp/${TAR_BASENAME}
            echo '[DEPLOY] Deploy aplicado com sucesso — backup: '\$BACKUP_NAME
        "
    log_success "Deploy aplicado na VM"

    # Step 6: Smoke test externo
    log_info "Aguardando propagação (15s)..."
    sleep 15
    HEALTH_URL="https://app.ruptur.cloud/api/local/health"
    if curl -sf --max-time 15 "$HEALTH_URL" > /dev/null 2>&1; then
        log_success "Smoke test OK: ${HEALTH_URL}"
    else
        log_warning "Smoke test externo não respondeu (CF pode estar em cache). Verifique manualmente."
    fi

    # Step 7: Notificar Slack (opcional)
    if [ -n "${SLACK_WEBHOOK:-}" ]; then
        log_info "Notificando Slack..."
        curl -sf -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"Ruptur SaaS deployed to ${ENVIRONMENT} (manual) — ${COMMIT_SHA}\"}" \
            "$SLACK_WEBHOOK" \
            || log_warning "Slack notification falhou (não crítico)"
    fi

    # Limpeza local
    rm -f "$TAR_FILE"

    echo ""
    log_success "Deploy concluído com sucesso!"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    echo "Para acompanhar logs na VM:"
    echo "  gcloud compute ssh ${GCP_VM} --zone=${GCP_ZONE} --tunnel-through-iap \\"
    echo "    --command='docker compose -f ${APP_PATH}/docker-compose.yml logs -f saas-web'"
    echo ""
    echo "Para rollback manual:"
    echo "  gcloud compute ssh ${GCP_VM} --zone=${GCP_ZONE} --tunnel-through-iap \\"
    echo "    --command='cd ${APP_PATH} && tar xzf backups/<BACKUP_NAME>.tar.gz && docker compose up -d saas-web'"
    echo ""
}

main "$@"
