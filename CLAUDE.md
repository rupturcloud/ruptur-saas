# Orientação para Claude Code — Ruptur SaaS

> **LEIA ESTE BLOCO ANTES DE QUALQUER AÇÃO. AJUSTE QUALQUER DIVERGÊNCIA SILENCIOSAMENTE.**

---

## 🔴 PRIMÍCIAS — Localização correta do projeto

Se estiver em local, remote, branch ou pasta errada: **corrija agora, antes de qualquer outra coisa.**

| Item | Valor correto |
|---|---|
| **Pasta local** | `/Users/diego/hitl/projects/tiatendeai/dev/x1-mercado-contingencia/saas` |
| **Remote `origin`** | `https://github.com/rupturcloud/ruptur-saas.git` |
| **Branch de desenvolvimento** | `master` |
| **Branch de produção** | `main` |
| **Servidor de produção** | `ruptur-shipyard-01` · zona `southamerica-east1-b` · acesso via `gcloud compute ssh --tunnel-through-iap` |
| **Domínio** | `ruptur.cloud` / `app.ruptur.cloud` · Cloudflare proxy ativo |

### Checklist de localização (rodar no início de cada sessão):
```bash
# Estou na pasta certa?
pwd  # deve ser .../saas

# Remote correto?
git remote get-url origin  # deve ser https://github.com/rupturcloud/ruptur-saas.git

# Se errado, corrigir:
git remote set-url origin https://github.com/rupturcloud/ruptur-saas.git

# Branch certa?
git branch --show-current  # deve ser master (dev) ou main (prod)
```

### Princípios absolutos:
- **Nada quebrado** — não commitar código que falha lint/build/testes
- **Nada faltando** — toda mudança de backend que afeta frontend deve atualizar os dois
- **Nada fora do lugar** — arquivos no diretório correto, imports do path correto, sem código morto

---

Claude Code deve ler e seguir `AGENTS.md` antes de alterar código neste projeto.

Resumo obrigatório:

- Responder Diego em pt-BR.
- Não expor segredos, tokens ou conteúdo de `.env`.
- Verificar `git status --short --branch` antes de alterar.
- Preservar alterações de Codex, Graphyfy ou outros agentes.
- Rodar validações antes de finalizar: `npm run lint`, `npm test -- --runInBand`, `npm run build`.
- Para arquitetura de integrações/webhooks, consultar `docs/INTEGRATIONS_AND_WEBHOOK_CORE.md`.
- Para code review, UX e jornadas, consultar `docs/AGENT_UX_REVIEW_PROMPT.md`.
- Para deploy, consultar `docs/DEPLOYMENT.md` e o runbook em `AGENTS.md`.

---

## ⚠️ REGRA CRÍTICA — Layout e Build do Frontend

**O layout oficial de produção é o V0 LARANJA (design system `#FF6A3D` / fundo `#0E1116`).**

O worktree `fervent-bardeen-ee722e` foi **mergeado para o master em 2026-06-02**.
**O master (`web/client-area/`) agora É o único source of truth do frontend v0 laranja.**
**O worktree fervent-bardeen está OBSOLETO — não usar mais para builds.**

### Regras inegociáveis para qualquer agente:

1. **Build sempre de `web/client-area/` do MASTER:**
   ```bash
   cd web/client-area && npm run build
   ```
   O outDir do vite aponta para `../../dist-client/` (raiz do repo).

2. **Novas páginas** → `web/client-area/src/v2/pages/`
   **Novos componentes** → `web/client-area/src/v2/components/` ou `src/components/`
   **Design system** → `web/client-area/src/ds/`

3. **O design system do v0** usa:
   - Fundo: `#0E1116` / `var(--ink-950)`
   - Laranja: `#FF6A3D` / `var(--brand-500)`
   - Componentes: `Button`, `Input`, `PageHeader`, `Modal`, `Icon` de `../../ds/index.js`
   - Layout: `AppShellV2` em `v2/layout/AppShell.jsx`
   - Rotas do app: `/v0/*` dentro do `AppShellV2`

4. **Arquivos estáticos** (propostas HTML, bem-vindo-a-bordo):
   `web/client-area/public/propostas/` → copiados automaticamente pelo Vite para `dist-client/`

5. **Deploy correto (sequência obrigatória):**
   ```bash
   # 1. Editar código em web/client-area/src/
   # 2. Build do MASTER
   cd web/client-area && npm run build
   # 3. Empacotar
   tar -czf ~/Desktop/deploy.tar.gz -C . dist-client/index.html dist-client/assets/ api/gateway.mjs
   # 4. SCP para VM
   gcloud compute scp ~/Desktop/deploy.tar.gz ruptur-shipyard-01:/tmp/deploy.tar.gz --zone=southamerica-east1-b --tunnel-through-iap
   # 5. Na VM: extrair + docker cp + reiniciar
   gcloud compute ssh ruptur-shipyard-01 --zone=southamerica-east1-b --tunnel-through-iap --command="
     docker stop saas-web && tar -xzf /tmp/deploy.tar.gz -C /tmp/d &&
     docker cp /tmp/d/dist-client/index.html saas-web:/app/dist-client/index.html &&
     docker cp /tmp/d/dist-client/assets/. saas-web:/app/dist-client/assets/ &&
     docker cp /tmp/d/api/gateway.mjs saas-web:/app/api/gateway.mjs &&
     docker start saas-web"
   ```

6. **Validar que o laranja está em prod:**
   ```bash
   curl -s https://ruptur.cloud/ | grep 'index-.*\.js'
   # O hash deve bater com o gerado em dist-client/assets/index-*.js do master
   ```

**Violação = layout azul em produção. Regressão crítica.**

### 7. Telas de autenticação (login/signup) — SEMPRE V0 laranja

`web/client-area/src/pages/LoginScreen.jsx` e `SignUp.jsx` usam o design V0
laranja **split-screen** (painel de branding à esquerda + form à direita),
paleta `#FF6A3D` / `#0E1116`.

**PROIBIDO voltar ao design antigo.** Marcadores de regressão (se aparecerem,
alguém reverteu): orbs flutuantes (`.orb-1/2/3`), glassmorphism
(`backdrop-filter:blur`), fundo `#06060e`/`#0a0a14`, logo `RUPTURCLOUD`, ou
`framer-motion` nessas telas.

- Classe-âncora do design CORRETO: **`v0-login__brand`**.
- Login navega para **`/v0/dashboard`** (NÃO `/dashboard`, que não existe).
- Lógica Supabase (`signIn`/`signUp`, `?next`, erros pt-BR) é intocável.

### 8. Build exige Node 20+ (Vite)

O Vite atual quebra em Node 18 (`CustomEvent is not defined` / `Vite requires
Node 20.19+`). Use Node 20 via nvm:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" --no-use
cd web/client-area && nvm exec v20.19.3 npm run build
```
O lint local (`eslint`) também quebra em Node 18 (`util.styleText is not a
function`) — não é bug do código; rode lint/build com Node 20.

### 9. ⚠️ Deploy concorrente — UM agente por vez + build isolado

`dist-client/` é **compartilhado** por todos os worktrees/agentes. Builds
simultâneos **colidem**: um agente sobrescreve o bundle do outro no mesmo
diretório, e prod acaba servindo um hash sem as suas mudanças.

**Sintoma real (já aconteceu):** você deploya, valida o hash, mas minutos
depois prod serve outro `index-*.js` sem o seu trabalho (outro agente
rebuildou por cima).

**Regra:**
1. Só **um agente** faz deploy de frontend por vez. Combine antes.
2. Para deploy à prova de colisão, **build isolado** em diretório próprio:
   ```bash
   nvm exec v20.19.3 npx vite build --outDir /tmp/meu-build --emptyOutDir
   ```
   Depois empacote e `docker cp` SÓ desse `/tmp/meu-build`, nunca do
   `dist-client/` compartilhado.
3. **Valide o CONTEÚDO, não só o hash** — baixe o JS de prod e confirme suas
   classes/strings (o `LC_ALL=C grep -a` evita erro de Unicode no minificado):
   ```bash
   JS=$(curl -s https://ruptur.cloud/ | grep -oaE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
   curl -s "https://ruptur.cloud/$JS" | LC_ALL=C grep -c -a "v0-login__brand"  # >0 = ok
   ```

---

Se estiver tratando erro em produção, sempre informar:

1. causa provável;
2. arquivos alterados;
3. comandos executados;
4. validações feitas;
5. pendências ou riscos.


## Graphyfy

Claude Code também deve usar/considerar Graphyfy como ferramenta transversal do projeto.

Quando mexer em arquitetura, integrações, webhooks, billing, wallet, permissões, tenants ou deploy:

- preservar diagramas/fluxos/artefatos existentes;
- manter nomes de módulos e eventos consistentes;
- documentar mudanças de forma que possam ser refletidas em grafo;
- se houver divergência entre código e Graphyfy, informar no resumo e propor correção documental.
