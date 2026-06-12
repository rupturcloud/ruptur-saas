# Casos de Teste - Inbox e CRM

Este documento define os cenários de teste validados para as melhorias de agregação multi-instância e correções do CRM.

## 1. Inbox: Filtro por Instância e Agregação
- **CT01**: Selecionar a aba "Todas as Instâncias" na Inbox deve carregar as mensagens agregadas.
  - **Resultado Esperado**: O sistema faz a chamada com `instanceKey='all'`, retornando mensagens de todos os chips ativos associados ao Tenant.
- **CT02**: Filtrar por uma Instância Específica.
  - **Resultado Esperado**: O sistema faz a chamada com o ID da instância específica e retorna apenas as conversas daquele chip.

## 2. Inbox: Filtros e Tags
- **CT03**: Selecionar uma Tag específica no filtro.
  - **Resultado Esperado**: As conversas carregadas devem exibir apenas as que possuem a etiqueta correspondente, independentemente se na visualização "Todas as Instâncias" ou "Específica".

## 3. CRM: Integração Pipeline
- **CT04**: Carregamento da pipeline de Vendas (Kanban).
  - **Resultado Esperado**: A rota `/api/crm/pipeline` consulta corretamente as instâncias via `instance_registry` e exibe os leads distribuídos em suas respectivas colunas.

## 4. Lint & Build
- **CT05**: Executar `npm run lint`.
  - **Resultado Esperado**: Zero erros, sem violações do tipo `react-hooks/set-state-in-effect` ou `no-unused-vars` em componentes como `Admin.jsx` e `Leads.jsx`.
- **CT06**: Executar `npm run build`.
  - **Resultado Esperado**: O build de produção (Vite) completa sem falhas e o diretório `dist-client` é gerado.
