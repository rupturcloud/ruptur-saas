# Operating Model - SaaS Tier 1

Este documento estabelece o padrão arquitetural e de engenharia para o Ruptur Cloud, operando sob os mesmos princípios técnicos exigidos por empresas Tier 1 (Citadel, Palantir, Anduril, Stripe, Salesforce).

## A Filosofia de Engenharia

O desenvolvimento deste produto deve abandonar a cultura de "feature factory" e adotar o rigor de **Site Reliability Engineering (SRE)**.

**Pilares:**
1. **Estado determinístico**: Sabemos o que o sistema está fazendo.
2. **Observabilidade completa**: Toda ação gera log auditável.
3. **Testes automatizados**: Código sem teste é código legado.
4. **Idempotência**: Requisições repetidas não duplicam faturamento, contatos ou mensagens.
5. **Fail-safe**: Se algo falhar, falha de maneira isolada e segura.

## A Arquitetura B2B Enterprise

Inspirada no Microsoft Dynamics e Salesforce, o núcleo do sistema adota um modelo Multi-Tenant hierárquico:

1. **Tenant (Matriz):** Faturamento, Ownership, Wallet, Subscrição.
2. **Business Units / Companies:** Ambientes operacionais isolados onde as instâncias e CRMs operam de forma protegida (RLS isolado).
3. **RBAC:** Acesso baseado em papéis de controle financeiro (Tenant) vs Operacionais (Company).

## Pipeline de Validação (O Padrão de Execução)

Antes do deploy de qualquer nova feature estrutural (como o modelo Multi-Empresa), o time de desenvolvimento (Agentes e Humanos) deve passar por:

1. **Spec & Arquitetura**: Definição em `docs/specs`.
2. **Contrato de API**: Modelagem de requisição/resposta.
3. **Teste Automatizado**: Evidência que o fluxo funciona isolado.
4. **Implementação**: Código limpo.
5. **Validação Visual (Playwright)**: Comprovação com evidência visual (screenshot/vídeo) que a UI responde corretamente.
6. **Deploy Controlado**: Rollout com plano de rollback.

> Nenhuma evolução do núcleo sem antes garantir que o chão de fábrica atual está funcionando.
