# 📍 Repo Canônico — Ruptur SaaS (LEIA ANTES DE TRABALHAR)

> **Para TODOS os agentes (humanos ou IA) que estiverem atuando neste projeto.**
> Se você está em outro local, remote, pasta, repo ou branch — **ajuste para o que está aqui ANTES de continuar sua demanda.**
>
> Premissas inegociáveis: **nada quebrado · nada faltando · nada fora do lugar.**

---

## ✅ O lugar CERTO (fonte única de verdade)

| Item | Valor correto |
|---|---|
| **Repo remoto (origin)** | `https://github.com/rupturcloud/ruptur-saas.git` |
| **Pasta local** | `/Users/diego/hitl/projects/tiatendeai/dev/x1-mercado-contingencia/saas` |
| **Branch de PRODUÇÃO** | `main` |
| **Branch de DESENVOLVIMENTO** | `master` |
| **Deploy de produção** | VM GCP `ruptur-shipyard-01` (zona `southamerica-east1-b`) via IAP → `https://ruptur.cloud` |
| **Layout oficial** | V0 LARANJA (`AppShellV2` em `/v0/*`). `#FF6A3D` / `#0E1116` |

### Branches especiais (NÃO apagar, NÃO usar como base)
| Branch | O que é |
|---|---|
| `legacy-main-2026-05` | Arquivo histórico do `main` antigo/órfão (30 commits, parado em 2026-05-01). Preservado para auditoria. **Não rebasear, não mergear.** |
| `claude/*` | Worktrees temporários de sessões antigas. **Obsoletos.** Não criar novos. |

---

## 🚦 Como saber se VOCÊ está no lugar certo

Rode na raiz do projeto:

```bash
git remote -v          # origin DEVE ser github.com/rupturcloud/ruptur-saas.git
git branch --show-current   # DEVE ser 'master' (dev) — nunca trabalhar direto em 'main'
pwd                    # DEVE terminar em .../x1-mercado-contingencia/saas
```

Se os três baterem → você está certo, **siga sua demanda.**
Se qualquer um divergir → **corrija com a seção abaixo antes de continuar.**

---

## 🔧 Como CORRIGIR se estiver no lugar errado

### Remote errado (ex.: apontando para `hitl-automation-engine` ou outro)
```bash
git remote set-url origin https://github.com/rupturcloud/ruptur-saas.git
git fetch origin
```

### Branch errada (trabalhando em `main`, num `claude/*`, ou detached)
```bash
git stash                      # guarda trabalho em andamento, se houver
git checkout master            # vai para a branch de dev
git pull origin master         # sincroniza
git stash pop                  # recupera o trabalho (resolva conflitos se houver)
```

### Pasta/repo errado (clone novo no lugar certo)
```bash
cd /Users/diego/hitl/projects/tiatendeai/dev/x1-mercado-contingencia
git clone https://github.com/rupturcloud/ruptur-saas.git saas
cd saas && git checkout master
```

---

## 🗺️ Onde cada peça do SaaS vive (mapa de componentes)

O SaaS é composto por **3 repositórios**. Saiba qual tocar para cada demanda:

| Componente | Repo | Caminho |
|---|---|---|
| **App / API / Front** (gateway, billing, CRM, campanhas, telas) | `rupturcloud/ruptur-saas` ← **ESTE** | raiz |
| **Runtime de Warmup / Baileys / Whisper** | `tiatendeai/ruptur` | `deploy/host2/` |
| **Histórico órfão antigo** (somente leitura) | `rupturcloud/ruptur-saas` | branch `legacy-main-2026-05` |

> ⚠️ Se sua demanda é sobre **aquecimento/warmup runtime**, o código de execução vive em `tiatendeai/ruptur/deploy/host2`.
> A camada de **orquestração/UI de warmup** (o que o cliente vê) vive AQUI em `modules/warmup-core/` e `web/client-area/`.

---

## 🔁 Fluxo de trabalho padrão (dev → prod)

```
1. Trabalhe SEMPRE em `master` (dev)
2. Commit com mensagem semântica (feat/fix/chore/docs)
3. Push:  git push origin master
4. Validação obrigatória ANTES de promover (ver AGENTS.md):
   - npm run lint
   - npm test -- --runInBand
   - npm run build         (a partir de web/client-area/)
5. Promover para produção: master → main (só após validação verde)
6. Deploy na VM: ver docs/DEPLOY-SSH.md (gcloud IAP, NÃO rsync direto)
```

**Nunca** commite direto em `main`. **Nunca** force-push em `main` sem o legacy preservado.

---

## 🔒 Regras de segurança (herdadas do CLAUDE.md / AGENTS.md)

- **Nunca** commitar arquivos `.env*` (já no `.gitignore`).
- **Nunca** commitar `~/.ssh/ruptur_deploy_ci` nem `~/.ssh/google_compute_engine`.
- Segredos (tokens UAZAPI, Getnet, Supabase service key) vivem **só** no `.env` da VM.
- `GETNET_WEBHOOK_ALLOW_UNSIGNED` e `BILLING_POC_INSTANT_CREDIT` devem ser `false` em prod/homologação.

---

## 📌 Estado no momento desta instrução (2026-06-03)

- `origin` = `ruptur-saas` ✅ (já reconfigurado)
- `master` (dev) = código atual de produção (v0 laranja, billing Getnet, logout/idle)
- `main` (prod) = **em sincronização** com o código atual (estava com versão antiga)
- `legacy-main-2026-05` = histórico velho preservado ✅

> Última revisão por: sessão de consolidação do repo canônico.
> Se este documento divergir da realidade, a realidade do `origin/master` prevalece — atualize este arquivo.
