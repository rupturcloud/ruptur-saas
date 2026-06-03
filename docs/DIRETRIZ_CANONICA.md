# DIRETRIZ CANÔNICA — Ruptur SaaS

> **Obrigatória. Sobrepõe qualquer instinto ou instrução anterior.**
> Última atualização: **2026-06-03**

Este documento existe para que **qualquer agente** (IA ou humano) que esteja
trabalhando no lugar errado se corrija sozinho, sem quebrar nada.

---

## PRIMÍCIAS (não-negociáveis)

Valide as três ao fim de **cada** tarefa:

1. **NADA QUEBRADO** — `lint` + `test` + `build` passam antes de declarar pronto.
2. **NADA FALTANDO** — nenhum commit, arquivo ou feature perdido na reconciliação.
3. **NADA FORA DO LUGAR** — local, remote, repo e branch corretos (abaixo).

---

## LOCALIZAÇÃO CORRETA (única fonte de verdade)

| Item | Valor canônico |
|---|---|
| **Pasta local** | `/Users/diego/hitl/projects/tiatendeai/dev/x1-mercado-contingencia/saas` |
| **Remote (`origin`)** | `https://github.com/rupturcloud/ruptur-saas.git` |
| **Branch com o CÓDIGO COMPLETO de produção** | `claude/fervent-bardeen-ee722e` |
| **Mapeamento de ambiente** | `main` = produção · `master` = desenvolvimento |

> `main` e `master` só podem ser atualizados **A PARTIR DE** `claude/fervent-bardeen-ee722e`,
> nunca o contrário.

---

## ⚠️ ESTADO ATUAL DO GIT (cuidado — leia antes de qualquer push)

No momento desta escrita (2026-06-03):

- `claude/fervent-bardeen-ee722e` está **+56 commits À FRENTE** de `origin/main`.
- `origin/main` tem **30 commits que `fervent-bardeen` NÃO tem**.
- **➡️ As branches DIVERGIRAM.** A reconciliação **não é fast-forward**: exige
  merge analisado, com cuidado para preservar os dois lados.

**Consequências práticas:**

- ❌ **NÃO** use `origin/main` ou `master` como base de trabalho novo — estão atrás.
- ❌ **NÃO** publique `master`/`main` por cima de `fervent-bardeen` — regride 56 commits
  (deadlock fix de senha, `ForcePasswordChange`, logout + idle timeout, sw v2.3.0,
  Inbox, SSE, números auto-detect, propostas comerciais).
- ✅ A branch `fervent-bardeen` JÁ está publicada no `origin` (protegida contra perda).
- ✅ A reconciliação `fervent-bardeen → main/master` é um **RED GATE**: só com decisão
  explícita do Diego, com merge revisado commit a commit.

---

## LOCAIS ERRADOS (abandone se estiver neles)

| Local errado | Por quê | O que fazer |
|---|---|---|
| Remote `hitl-automation-engine` | Era o `origin` errado | Trocar para `rupturcloud/ruptur-saas` |
| Repo `tiatendeai/ruptur` | É só a **runtime de warmup** (`deploy/host2`: baileys, whisper). **Não** é o app SaaS. | Não colocar código de app/API/front lá |
| Branches `main` / `master` / `legacy-main-2026-05` como base de trabalho novo | Estão atrás / são arquivo | Rebasear em cima de `fervent-bardeen` |

> A runtime de warmup em `tiatendeai/ruptur/deploy/host2` é uma **dependência** do
> SaaS, não o repositório do app. As duas coisas convivem, mas não se misturam.

---

## COMO SE CORRIGIR (se você está no lugar errado)

```bash
# 1. Vá para a pasta local correta
cd /Users/diego/hitl/projects/tiatendeai/dev/x1-mercado-contingencia/saas

# 2. Confirme o remote — DEVE ser rupturcloud/ruptur-saas
git remote -v
#   Se não for, pare e avise o Diego antes de qualquer coisa.

# 3. Atualize as refs
git fetch origin

# 4. Reaplique/rebaseie seu trabalho EM CIMA da branch de verdade
#    (NUNCA em cima de master/main, que estão atrás)
git rebase origin/claude/fervent-bardeen-ee722e
#   (ou crie sua feature branch a partir dela)

# 5. Antes de QUALQUER push em main/master: confirme a estratégia com o Diego.
```

---

## VALIDAÇÃO (gate L99 — a partir de `web/client-area/`)

```bash
npm run lint
npm test -- --runInBand
npm run build
```

Sem os três verdes, **não** declare pronto.

---

## NÃO FAÇA sem OK explícito do Diego (RED GATES)

- `push`/`force-push` em `main`, `master` ou `legacy-main-2026-05`.
- Merge/rebase que descarte qualquer um dos 56 commits de `fervent-bardeen`
  **ou** dos 30 commits divergentes de `origin/main`.
- Tocar em `.env`, segredos ou tokens (nunca commitar, nunca colar em chat).
- Desabilitar/alterar `GETNET_WEBHOOK_ALLOW_UNSIGNED` ou `BILLING_POC_INSTANT_CREDIT`
  sem alinhar (devem ficar **desligados** antes da homologação).

---

## SEGREDOS — regras permanentes

- Nunca commitar `.env` (verificado limpo).
- Nunca commitar `~/.ssh/ruptur_deploy_ci` nem `~/.ssh/google_compute_engine`.
- Senha temporária `Ruptur@2026!` deve ser trocada no primeiro acesso.
- Instâncias UAZAPI free expiram em 1h.

---

*Identidade firmada. Disciplina, foco, constância. Ordem a partir do caos → entrega L99.*
