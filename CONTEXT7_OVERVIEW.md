# Will Dados Pró — Visão Geral da Arquitetura (v3.0)

Este documento descreve a infraestrutura técnica centralizada no monitoramento e auditoria da plataforma Will Dados Pró.

## 🏗️ Camadas do Sistema

### 1. Web Frontend (Dashboard & Admin)
- **Tecnologia**: Vite MPA (Multi-Page Application) + Vanilla JS.
- **Segurança**: Gerenciada pelo `src/session.js` (Auth Guard, RBAC e Heartbeat).
- **Comunicção**: Supabase Client (JS SDK).

### 2. Extensão Chrome (O Robô)
- **Service Worker (`background.js`)**: O cérebro da extensão. Gerencia o estado global, telemetria e o **Kill-Switch**.
- **Engine (`engine.js`)**: O coração da automação. Analisa padrões e envia logs de auditoria (`BET`, `INFO`).
- **Isolation**: Toda a comunicação com o banco de dados é feita via Background para evitar detecção no frame do cassino.

### 3. Backend (Supabase)
- **Autenticação**: Supabase Auth (JWT).
- **Banco de Dados**: PostgreSQL com RLS (Row Level Security).
- **Realtime**: Utilizado para o rastreamento live de sessões no painel administrativo.

---

## 📡 Monitoramento e Realtime

### Sistema de Heartbeat
Um pulso de presença é enviado a cada 60 segundos por todas as instâncias ativas (Web e Extensão):
- **Tabela**: `active_sessions`.
- **Campos**: `id`, `user_id`, `hardware_id`, `client_type` (web/extension), `current_page`.
- **Limpeza**: O painel admin limpa automaticamente sessões órfãs (> 5 min).

---

## 🔍 Observabilidade e Suporte

A camada de telemetria foi expandida para permitir suporte proativo ao usuário:
- **Tipos de Evento**: `DEBUG`, `INFO`, `WARN`, `ERROR`, `BET`.
- **Inspeção Forense**: O administrador pode visualizar o payload JSON de qualquer log para entender exatamente o que o motor do robô processou em um dado momento.

---

## 💰 Inteligência Financeira

A carteira (`wallet.html`) não utiliza dados mockados:
- **Cálculo Baseado em Hardware ID**: Garante que o usuário veja apenas a performance do seu robô.
- **Win Rate Real**: Calculado via agregação de eventos `BET` na tabela de telemetria.

---

## 🔒 Segurança (Kill-Switch)

Um mecanismo de proteção remota está integrado em todas as camadas:
- Se uma licença for marcada como `suspended` no banco de dados, o `session.js` (Web) bloqueia o acesso e o `background.js` (Extensão) cessa a execução do robô no próximo ciclo de pulso (60s).

---

## 🚀 Estratégia de Deploy e Ambientes

Para garantir a estabilidade das operações dos usuários finais, utilizamos a infraestrutura de CI/CD do **Vercel**:

### 1. Ambiente de Produção (Production)
A URL fixa (ex: `will-dados-pro-three.vercel.app`) representa a versão estável ("Golden Image") do sistema. É por este link que os usuários cadastrados acessam a ferramenta. Alterações nesta URL devem ser feitas apenas após validação rigorosa.

### 2. Ambiente de Preview (Testes/Homologação)
Cada deploy gera uma URL única de "Preview". Esta deve ser utilizada para:
- Validar se o **robô** está injetando corretamente no cassino.
- Testar se os **logs de auditoria** estão chegando ao Supabase.
- Verificar o funcionamento do **Kill-Switch** antes de promover o código para todos.

**Dica de Fluxo**: Sempre valide em uma URL de Preview antes de rodar o comando final de produção (`npx vercel --prod`).
