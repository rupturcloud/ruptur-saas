# Estratégia de Branches — Ruptur SaaS

> **Repositório canônico:** https://github.com/rupturcloud/ruptur-saas
> Este é o **único** remote oficial do Ruptur SaaS. Não usar `hitl-automation-engine` (era compartilhado com outro projeto — bacbo/extensões).

## Branches

| Branch | Papel | Regras |
|---|---|---|
| **`main`** | **Produção** (ruptur.cloud) | Só recebe merge a partir de `master` após validação. Toda atualização de prod sai daqui. Não commitar direto. |
| **`master`** | **Desenvolvimento / débitos técnicos** | Branch de trabalho. Features e correções entram aqui primeiro. |
| **`legacy-main-2026-05`** | **Arquivo histórico** | Snapshot do `main` antigo e órfão (commit `e76f9b6`, 2026-05-01). Mantido apenas para consulta. Não usar. |

## Fluxo de trabalho

```
master (dev)  ──merge──►  main (prod)  ──deploy──►  ruptur.cloud
```

1. Trabalhar e commitar em `master`.
2. Rodar validações: `npm run lint`, `npm test -- --runInBand`, `npm run build` (de `web/client-area/`).
3. Quando estável, merge `master` → `main`.
4. Deploy de produção a partir de `main` (ver `CLAUDE.md` e `docs/DEPLOYMENT.md`).

## Histórico da consolidação (2026-06-03)

- O código de produção do SaaS vivia no `master` do repo errado (`hitl-automation-engine`), com história **independente** (sem ancestral comum) do `ruptur-saas/main`, que estava parado desde 2026-05-01.
- Decisão: o `master` local (código de prod atual) passou a ser a **verdade** do `ruptur-saas`.
- O `main` antigo do `ruptur-saas` foi arquivado em `legacy-main-2026-05` antes de qualquer sobrescrita (nada foi perdido).

## Componentes do SaaS fora deste repo (a consolidar)

- **Runtime de warmup / baileys / whisper**: hoje em `tiatendeai/ruptur` → `deploy/host2`.
  Decisão de consolidação pendente — documentar dependência até migrar.
