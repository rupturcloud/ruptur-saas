# Blueprint: Migração Completa Bubble → Backend Próprio (UAZAPI)

**Objetivo**: eliminar completamente a dependência do Bubble, movendo todas as funcionalidades de inbox, CRM, campanhas, warmup e gestão de instâncias para o backend Node.js/Supabase próprio da Ruptur, consumindo a uazapi diretamente.

**Versão**: 1.0  
**Data**: 2026-05-13  
**Escopo**: SaaS multi-tenant Ruptur Cloud

---

## 1. Contexto e Situação Atual

### Arquitetura Atual
- **Frontend**: React SPA (web/client-area)
- **Backend**: Node.js ESM + Supabase PostgreSQL + Redis/Bull
- **Provider WhatsApp**: uazapi (servidor tiatendeai.uazapi.com)
- **Dependência Bubble**: hoje o Bubble usa plugin uazapiGO para inbox e campanhas
- **Objetivo Imediato**: substituir Bubble mantendo uazapi
- **Objetivo Futuro (Fase 3)**: preparar abstração para migração futura para Evolution API self-hosted

### Padrão Arquitetural Ruptur
```
Integrações externas → adapters/presets → eventos internos → motores agnósticos
```

**Regra**: motores internos (`billing`, `wallet`, `campaigns`, `warmup-core`, `subscription`) NÃO devem depender diretamente de APIs externas específicas.

### Módulos Existentes
- `api/gateway.mjs`: Gateway HTTP principal
- `modules/billing/`: Billing, gateways de pagamento
- `modules/integrations-core/`: Presets/adapters de integrações
- `modules/webhook-core/`: Ingestão, normalização, idempotência
- `modules/wallet/`: Motor de créditos
- `modules/warmup-core/`: Runtime de aquecimento
- `modules/providers/`: Gestão de contas UAZAPI
- `modules/provider-adapter/`: Adapter UAZAPI expandido
- `modules/inbox/`: Base de inbox (precisa expansão)
- `modules/campaigns/`: Base de campanhas (precisa expansão)
- `web/client-area/src/`: Frontend React

### Tabelas Relevantes Já Existentes
- `provider_accounts`: contas/pools UAZAPI (migration 012)
- `provider_account_assignments`: vínculo tenant → provider account
- `api_leases`: leases temporários/persistentes por tenant
- `instance_registry`: registro de instâncias WhatsApp
- `integration_accounts`: contas agnósticas de integrações (migration 014)
- `integration_webhook_events`: inbox durável para webhooks brutos
- `internal_events`: eventos canônicos internos
- `uazapi_chats`, `uazapi_messages`, `uazapi_contacts`, `uazapi_presence`, `uazapi_connection`, `uazapi_webhook_events`, `uazapi_chat_labels` (migration 017)

---

## 2. Links do Ecossistema com 5W Cards

### 2.1. Evolution API
**URL**: https://github.com/EvolutionAPI/evolution-api

**Who**: Para gestores técnicos da Ruptur e futuros deploys self-hosted  
**What**: WhatsApp API self-hosted open-source, alternativa à uazapi  
**When**: Fase 3 (soberania total), quando quisermos hospedar nossa própria infra de WhatsApp  
**Where**: GitHub público, deploy Docker/Kubernetes  
**Why**: Elimina dependência de provider externo, permite controle total sobre instâncias, reduz custos operacionais em escala, evita vendor lock-in

### 2.2. UAZAPI (Site Principal)
**URL**: https://uazapi.dev

**Who**: Para desenvolvedores e gestores técnicos da Ruptur  
**What**: Landing page oficial da UAZAPI, documentação de produto  
**When**: Descoberta inicial, onboarding, entendimento do serviço  
**Where**: Site público da uazapi  
**Why**: Entender capacidades, limitações, modelo de negócio, diferença entre planos free/paid/dedicated

### 2.3. UAZAPI Conecte (Painel de Conexão)
**URL**: https://uazapi.dev/interno?p=conecte

**Who**: Para admins da Ruptur que gerenciam provider accounts  
**What**: Painel interno da UAZAPI para conectar/gerenciar instâncias  
**When**: Criação manual de instâncias, troubleshooting de conexão  
**Where**: Área restrita uazapi  
**Why**: Acesso direto ao painel do provider quando necessário intervenção manual ou validação de instâncias

### 2.4. UAZAPI Servidor Produção
**URL**: https://tiatendeai.uazapi.com

**Who**: Para o backend Node.js da Ruptur (via `modules/provider-adapter`)  
**What**: Servidor produção da uazapi, onde nossas instâncias rodam  
**When**: Toda operação de criação, conexão, envio, sync de mensagens  
**Where**: Endpoint base do adapter  
**Why**: É o servidor real que hospeda as instâncias dos clientes da Ruptur, onde consumimos a OpenAPI completa

### 2.5. Bubble Multiatendimento
**URL**: https://uazapigo-multiatendimento.bubbleapps.io

**Who**: Para usuários finais da Ruptur (clientes) — **ALVO DE SUBSTITUIÇÃO**  
**What**: App Bubble atual com inbox/atendimento via plugin uazapiGO  
**When**: Hoje (fase pré-migração), em uso pelos clientes  
**Where**: Hospedado no Bubble  
**Why**: É o inbox que queremos ELIMINAR, migrando funcionalidades para o backend próprio + React SPA

### 2.6. Plugin Bubble uazapiGO
**URL**: https://bubble.io/plugin/uazapigo---whatsapp-api-1725712298105x455773695640076300

**Who**: Para desenvolvedores Bubble (contexto histórico)  
**What**: Plugin Bubble que conecta app Bubble à uazapi  
**When**: Usado atualmente pelo app de multiatendimento  
**Where**: Marketplace de plugins Bubble  
**Why**: Entender quais endpoints/funcionalidades o plugin expõe para replicar no backend próprio

### 2.7. UAZAPI Docs
**URL**: https://docs.uazapi.com

**Who**: Para desenvolvedores backend da Ruptur  
**What**: Documentação oficial completa da API uazapi  
**When**: Durante implementação de novos endpoints, troubleshooting  
**Where**: Site de docs  
**Why**: Referência técnica oficial para schemas, headers, webhooks, eventos, limites de rate, autenticação

### 2.8. UAZAPI Config Bubble
**URL**: https://uazapi.dev/interno?p=configbubble

**Who**: Para desenvolvedores Bubble/admins (contexto histórico)  
**What**: Configuração específica do plugin Bubble na uazapi  
**When**: Setup inicial do plugin (fase antiga)  
**Where**: Área interna uazapi  
**Why**: Entender como o Bubble se conecta à uazapi, replicar lógica de autenticação e webhooks no backend próprio

### 2.9. UAZAPI Plugin Interno
**URL**: https://uazapi.dev/interno?p=plugin

**Who**: Para admins técnicos da Ruptur  
**What**: Gestão de plugins e extensões da uazapi  
**When**: Configuração avançada de integração  
**Where**: Painel interno  
**Why**: Acesso a configurações avançadas que podem ser necessárias para backend próprio, como global webhooks

---

## 3. Inventário Completo: Endpoints UAZAPI (OpenAPI Spec)

**Total de operações**: 139 métodos HTTP  
**Total de paths únicos**: ~105 endpoints

### 3.1. Administração e Instâncias (14 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/instance/create` | Criar nova instância | `admintoken` |
| GET | `/instance/all` | Listar todas as instâncias | `admintoken` |
| POST | `/instance/connect` | Conectar instância (gerar QR/paircode) | `token` |
| POST | `/instance/disconnect` | Desconectar instância | `token` |
| POST | `/instance/reset` | Reset completo da instância | `token` |
| DELETE | `/instance` | Deletar instância | `token` |
| GET | `/instance/status` | Status atual da instância | `token` |
| GET | `/instance/wa_messages_limits` | Limites de mensagens WhatsApp | `token` |
| POST | `/instance/updateInstanceName` | Atualizar nome da instância | `token` |
| POST | `/instance/updateAdminFields` | Atualizar campos admin customizados | `token` |
| POST | `/instance/presence` | Configurar presença (available/unavailable) | `token` |
| POST | `/instance/updateDelaySettings` | Atualizar delays entre mensagens (warmup) | `token` |
| POST | `/instance/privacy` | Configurar privacidade (last seen, foto, status) | `token` |
| GET | `/instance/privacy` | Consultar privacidade | `token` |

### 3.2. Proxy e Anti-Ban (3 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| GET | `/instance/proxy` | Consultar proxy configurado | `token` |
| POST | `/instance/proxy` | Configurar proxy para a instância | `token` |
| DELETE | `/instance/proxy` | Remover proxy | `token` |

### 3.3. Perfil (2 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/profile/name` | Atualizar nome do perfil WhatsApp | `token` |
| POST | `/profile/image` | Atualizar foto do perfil | `token` |

### 3.4. Webhooks (6 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| GET | `/webhook` | Consultar webhook da instância | `token` |
| POST | `/webhook` | Configurar webhook (URL, eventos, filtros) | `token` |
| GET | `/webhook/errors` | Erros do webhook | `token` |
| GET | `/globalwebhook` | Consultar global webhook (admin) | `admintoken` |
| POST | `/globalwebhook` | Configurar global webhook para todas as instâncias | `admintoken` |
| GET | `/globalwebhook/errors` | Erros do global webhook | `admintoken` |

### 3.5. SSE (Server-Sent Events) (1 endpoint)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| GET | `/sse` | Stream de eventos em tempo real | `token` |

### 3.6. Envio de Mensagens (10 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/send/text` | Enviar texto simples | `token` |
| POST | `/send/media` | Enviar mídia (image, video, audio, document, sticker) | `token` |
| POST | `/send/contact` | Enviar contato vCard | `token` |
| POST | `/send/location` | Enviar localização | `token` |
| POST | `/send/status` | Enviar status/stories | `token` |
| POST | `/send/menu` | Enviar menu interativo (botões) | `token` |
| POST | `/send/carousel` | Enviar carrossel de produtos/cards | `token` |
| POST | `/send/location-button` | Enviar botão de localização | `token` |
| POST | `/send/pix-button` | Enviar botão PIX para pagamento | `token` |
| POST | `/send/request-payment` | Solicitar pagamento | `token` |

### 3.7. Gerenciamento de Mensagens (9 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/message/presence` | Enviar presença (typing, recording) | `token` |
| GET | `/message/async` | Consultar fila de envio assíncrono | `token` |
| DELETE | `/message/async` | Limpar mensagem da fila assíncrona | `token` |
| POST | `/message/download` | Download de mídia de mensagem | `token` |
| POST | `/message/find` | Buscar mensagens | `token` |
| POST | `/message/history-sync` | Sincronizar histórico | `token` |
| POST | `/message/markread` | Marcar como lida | `token` |
| POST | `/message/react` | Reagir a mensagem (emoji) | `token` |
| POST | `/message/delete` | Deletar mensagem | `token` |
| POST | `/message/edit` | Editar mensagem | `token` |
| POST | `/message/pin` | Fixar mensagem | `token` |

### 3.8. Chats e Conversas (10 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/chat/find` | Buscar chats | `token` |
| POST | `/chat/details` | Detalhes do chat | `token` |
| POST | `/chat/check` | Verificar se número existe no WhatsApp | `token` |
| POST | `/chat/archive` | Arquivar chat | `token` |
| POST | `/chat/read` | Marcar chat como lido | `token` |
| POST | `/chat/mute` | Silenciar chat | `token` |
| POST | `/chat/pin` | Fixar chat | `token` |
| POST | `/chat/block` | Bloquear contato | `token` |
| GET | `/chat/blocklist` | Listar bloqueados | `token` |
| POST | `/chat/delete` | Deletar chat | `token` |
| GET | `/chat/labels` | Listar etiquetas do chat | `token` |

### 3.9. Etiquetas e Notas (6 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| GET | `/labels` | Listar todas as labels | `token` |
| POST | `/labels/refresh` | Atualizar labels do servidor | `token` |
| POST | `/label/edit` | Criar/editar label | `token` |
| GET | `/chat/notes` | Consultar notas do chat | `token` |
| POST | `/chat/notes/refresh` | Atualizar notas | `token` |
| POST | `/chat/notes/edit` | Editar notas internas | `token` |

### 3.10. Contatos (4 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| GET | `/contacts` | Listar contatos | `token` |
| POST | `/contacts/list` | Listar contatos com filtros | `token` |
| POST | `/contact/add` | Adicionar contato | `token` |
| POST | `/contact/remove` | Remover contato | `token` |

### 3.11. Respostas Rápidas (2 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/quickreply/edit` | Criar/editar resposta rápida | `token` |
| GET | `/quickreply/showall` | Listar todas as respostas rápidas | `token` |

### 3.12. Grupos (5 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/group/create` | Criar grupo | `token` |
| POST | `/group/info` | Informações do grupo | `token` |
| POST | `/group/join` | Entrar em grupo via link | `token` |
| POST | `/group/leave` | Sair do grupo | `token` |
| GET | `/group/list` | Listar grupos | `token` |

### 3.13. Comunidades (2 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/community/create` | Criar comunidade | `token` |
| POST | `/community/editgroups` | Editar grupos da comunidade | `token` |

### 3.14. Newsletters/Canais (20 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/newsletter/create` | Criar canal | `token` |
| GET | `/newsletter/list` | Listar canais | `token` |
| POST | `/newsletter/info` | Info do canal | `token` |
| POST | `/newsletter/link` | Obter link de convite | `token` |
| POST | `/newsletter/subscribe` | Inscrever em canal | `token` |
| POST | `/newsletter/messages` | Enviar mensagem no canal | `token` |
| POST | `/newsletter/messages/edit` | Editar mensagem do canal | `token` |
| POST | `/newsletter/messages/delete` | Deletar mensagem do canal | `token` |
| POST | `/newsletter/updates` | Atualizações do canal | `token` |
| POST | `/newsletter/viewed` | Marcar como visualizado | `token` |
| POST | `/newsletter/reaction` | Reagir a mensagem do canal | `token` |
| POST | `/newsletter/follow` | Seguir canal | `token` |
| POST | `/newsletter/unfollow` | Deixar de seguir | `token` |
| POST | `/newsletter/mute` | Silenciar canal | `token` |
| POST | `/newsletter/unmute` | Dessilenciar canal | `token` |
| POST | `/newsletter/delete` | Deletar canal | `token` |
| POST | `/newsletter/picture` | Atualizar foto do canal | `token` |
| POST | `/newsletter/name` | Atualizar nome do canal | `token` |
| POST | `/newsletter/description` | Atualizar descrição | `token` |
| POST | `/newsletter/settings` | Configurações do canal | `token` |
| POST | `/newsletter/search` | Buscar canais | `token` |
| POST | `/newsletter/admin/invite` | Convidar admin | `token` |
| POST | `/newsletter/admin/accept` | Aceitar convite admin | `token` |
| POST | `/newsletter/admin/remove` | Remover admin | `token` |
| POST | `/newsletter/admin/revoke` | Revogar convite | `token` |
| POST | `/newsletter/owner/transfer` | Transferir propriedade | `token` |

### 3.15. Sender/Campanhas Nativas UAZAPI (6 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/sender/simple` | Campanha simples (lista de números + mensagem) | `token` |
| POST | `/sender/advanced` | Campanha avançada (CSV, variáveis, delays) | `token` |
| POST | `/sender/edit` | Editar campanha | `token` |
| POST | `/sender/cleardone` | Limpar mensagens enviadas | `token` |
| POST | `/sender/clearall` | Limpar todas as mensagens | `token` |
| GET | `/sender/listfolders` | Listar pastas de campanhas | `token` |
| GET | `/sender/listmessages` | Listar mensagens da campanha | `token` |

### 3.16. Chamadas (2 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/call/make` | Fazer chamada de voz/vídeo | `token` |
| POST | `/call/reject` | Rejeitar chamada | `token` |

### 3.17. Chatwoot (1 endpoint)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/chatwoot/config` | Configurar integração Chatwoot | `token` |

### 3.18. Business API (6 endpoints)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/business/get/profile` | Obter perfil business | `token` |
| GET | `/business/get/categories` | Categorias business | `token` |
| POST | `/business/update/profile` | Atualizar perfil business | `token` |
| POST | `/business/catalog/list` | Listar catálogo de produtos | `token` |
| POST | `/business/catalog/info` | Info de produto | `token` |
| POST | `/business/catalog/delete` | Deletar produto | `token` |
| POST | `/business/catalog/show` | Mostrar produto | `token` |
| POST | `/business/catalog/hide` | Ocultar produto | `token` |

### 3.19. Admin (1 endpoint)
| Método | Endpoint | Descrição | Header Auth |
|--------|----------|-----------|-------------|
| POST | `/admin/restart` | Reiniciar servidor (admin) | `admintoken` |

---

## 4. Mapeamento Completo: Endpoints → Módulos SaaS

### 4.1. Inbox/Atendimento (módulo `modules/inbox`)

**O que o Bubble faz hoje**:
- Exibe lista de conversas (chats)
- Mostra histórico de mensagens
- Permite enviar texto, mídia, menu, contato, localização
- Marcar como lida, reagir, fixar
- Buscar conversas e mensagens
- Visualizar contatos e etiquetas
- Adicionar notas internas
- Arquivar, silenciar, fixar conversas

**Endpoints necessários**:
- `POST /chat/find` — buscar conversas
- `POST /chat/details` — detalhes da conversa
- `POST /chat/check` — verificar se número existe
- `POST /chat/archive`, `/chat/read`, `/chat/mute`, `/chat/pin`
- `POST /message/find` — buscar mensagens
- `POST /message/history-sync` — sincronizar histórico
- `POST /message/markread` — marcar como lida
- `POST /message/react` — reagir
- `POST /message/pin` — fixar
- `POST /message/delete`, `/message/edit`
- `POST /send/text`, `/send/media`, `/send/contact`, `/send/location`, `/send/menu`, `/send/carousel`
- `POST /message/presence` — enviar "digitando..."
- `POST /message/download` — baixar mídia
- `GET /contacts`, `POST /contacts/list` — listar contatos
- `GET /chat/labels`, `GET /labels`, `POST /labels/refresh`, `POST /label/edit` — etiquetas
- `GET /chat/notes`, `POST /chat/notes/refresh`, `POST /chat/notes/edit` — notas internas
- `GET /quickreply/showall`, `POST /quickreply/edit` — respostas rápidas

**Schema de dados necessário** (já existe parcialmente em migration 017):
- `uazapi_chats`: conversas
- `uazapi_messages`: mensagens
- `uazapi_contacts`: contatos
- `uazapi_presence`: status online/typing
- `uazapi_chat_labels`: etiquetas
- Adicionar: `uazapi_quick_replies`, `uazapi_chat_notes`

**Lógica de negócio no Node.js**:
- **InboxService**:
  - Sincronizar chats via webhook ou polling `/chat/find`
  - Sincronizar mensagens via webhook `messages` ou `/message/history-sync`
  - Normalizar eventos de webhook para tabela `uazapi_messages`
  - Marcar como lida ao abrir conversa
  - Enviar mensagens via adapter e registrar no ledger para billing
  - Buscar e filtrar conversas por tenant
  - Atualizar contatos e etiquetas
- **InboxController** (rotas):
  - `GET /api/inbox/chats` — listar conversas do tenant
  - `GET /api/inbox/chats/:chatId/messages` — mensagens da conversa
  - `POST /api/inbox/chats/:chatId/messages` — enviar mensagem
  - `POST /api/inbox/chats/:chatId/mark-read`
  - `POST /api/inbox/chats/:chatId/archive`
  - `POST /api/inbox/contacts` — listar contatos
  - `GET /api/inbox/labels` — listar etiquetas
  - `POST /api/inbox/labels` — criar etiqueta
  - `POST /api/inbox/quick-replies` — criar resposta rápida

**Eventos/webhooks a escutar**:
- `messages`: nova mensagem recebida
- `messages_update`: atualização de status (delivered, read)
- `chats`: alterações em chats
- `chat_labels`: mudanças em etiquetas
- `presence`: status online/typing
- `contacts`: atualizações de contatos

**Dependências**:
- Adapter UAZAPI (`modules/provider-adapter/uazapi-adapter.js`)
- Webhook core (`modules/webhook-core`)
- Wallet (dedução de créditos por mensagem enviada)

---

### 4.2. CRM/Pipeline (módulo `modules/crm`)

**O que o Bubble faz hoje**:
- Gestão de leads por conversa
- Campos customizados: lead_name, lead_fullName, lead_email, lead_personalid, lead_status, lead_customfields
- Pipeline/etapas (funil de vendas)
- Anotações internas por lead

**Endpoints necessários**:
- `POST /chat/details` — inclui campos de lead (lead_name, lead_email, lead_status, etc.)
- `POST /chat/notes/edit` — editar campos de lead e notas
- `POST /chat/find` — buscar por lead_status, lead_email, etc.
- `GET /contacts`, `POST /contacts/list` — dados de contato

**Schema de dados necessário** (expandir migration 017):
- `uazapi_chats` já tem campos `lead_*` no schema OpenAPI
- Adicionar tabela `crm_leads`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `chat_id TEXT` (FK para uazapi_chats)
  - `contact_phone TEXT`
  - `lead_name TEXT`
  - `lead_full_name TEXT`
  - `lead_email TEXT`
  - `lead_personal_id TEXT`
  - `lead_status TEXT` (novo, qualificado, negociação, ganho, perdido)
  - `lead_pipeline_stage TEXT`
  - `lead_score INTEGER`
  - `custom_fields JSONB`
  - `notes TEXT`
  - `assigned_to UUID` (usuário responsável)
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **CRMService**:
  - Criar/atualizar lead a partir de conversa
  - Mover lead entre etapas do pipeline
  - Atualizar campos customizados
  - Buscar leads por status, responsável, etapa
  - Sincronizar lead_* fields com `/chat/notes/edit` (adminFields da uazapi)
- **CRMController**:
  - `GET /api/crm/leads` — listar leads
  - `GET /api/crm/leads/:id` — detalhes do lead
  - `PUT /api/crm/leads/:id` — atualizar lead
  - `POST /api/crm/leads/:id/stage` — mover etapa
  - `GET /api/crm/pipeline` — visualização do funil

**Eventos/webhooks**:
- Mesmos de inbox (`messages`, `chats`)
- Criar evento interno `lead.updated` quando campos de CRM mudarem

**Dependências**:
- Inbox (conversa é base do lead)
- Adapter UAZAPI

---

### 4.3. Campanhas de Disparo (módulo `modules/campaigns`)

**O que o Bubble faz hoje**:
- Criar campanha com lista de números
- Upload de CSV
- Mensagem template com variáveis
- Agendamento
- Disparo em lote com delays
- Tracking de envios (pendente, enviado, entregue, lido, erro)

**Endpoints necessários**:
- `POST /send/text`, `/send/media`, `/send/menu`, `/send/carousel`, `/send/pix-button` — envio unitário
- `GET /message/async`, `DELETE /message/async` — gerenciar fila assíncrona (se usar)
- Alternativamente, usar `/sender/simple` ou `/sender/advanced` (campanhas nativas da uazapi)
- `POST /chat/check` — validar números antes de enviar

**Schema de dados necessário** (expandir migration 005):
- Tabela `campaigns` já existe, garantir campos:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `name TEXT`
  - `message_template TEXT`
  - `message_type TEXT` (text, media, menu, carousel)
  - `media_url TEXT`
  - `status TEXT` (draft, scheduled, running, paused, completed, failed)
  - `scheduled_at TIMESTAMPTZ`
  - `started_at TIMESTAMPTZ`
  - `completed_at TIMESTAMPTZ`
  - `total_recipients INTEGER`
  - `sent_count INTEGER`
  - `delivered_count INTEGER`
  - `read_count INTEGER`
  - `error_count INTEGER`
  - `metadata JSONB` (delays, variáveis)
  - `created_by UUID`
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`
- Tabela `campaign_recipients`:
  - `id UUID PRIMARY KEY`
  - `campaign_id UUID NOT NULL`
  - `phone TEXT NOT NULL`
  - `variables JSONB` (nome, empresa, etc. para template)
  - `status TEXT` (pending, sent, delivered, read, failed)
  - `message_id TEXT` (ID da mensagem enviada)
  - `sent_at TIMESTAMPTZ`
  - `delivered_at TIMESTAMPTZ`
  - `read_at TIMESTAMPTZ`
  - `error TEXT`
  - `created_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **CampaignService**:
  - Criar campanha e importar CSV
  - Validar números com `/chat/check`
  - Agendar campanha (Bull job)
  - Disparar mensagens em lote com delays configuráveis (warmup-aware)
  - Atualizar status via webhooks `messages_update`
  - Pausar/retomar campanha
  - Calcular estatísticas (taxa de entrega, leitura)
- **CampaignController**:
  - `POST /api/campaigns` — criar campanha
  - `GET /api/campaigns` — listar campanhas do tenant
  - `GET /api/campaigns/:id` — detalhes e estatísticas
  - `POST /api/campaigns/:id/start` — iniciar
  - `POST /api/campaigns/:id/pause` — pausar
  - `POST /api/campaigns/:id/resume` — retomar
  - `DELETE /api/campaigns/:id` — cancelar
  - `GET /api/campaigns/:id/recipients` — status dos destinatários

**Eventos/webhooks**:
- `messages_update`: atualizar status de entrega/leitura
- `sender`: se usar sender nativo da uazapi

**Dependências**:
- Adapter UAZAPI
- Bull/Redis para filas
- Warmup-core (respeitar delays)
- Wallet (dedução de créditos por mensagem)
- Billing (auditoria de uso)

---

### 4.4. Recuperação de Carrinho (módulo `modules/campaigns` ou novo `modules/cart-recovery`)

**O que o Bubble faz hoje**:
- Detectar carrinho abandonado (integração externa, ex: Shopify, WooCommerce)
- Enviar mensagem automática após X minutos
- Template personalizado com produto, link, botão PIX
- Tracking de conversão

**Endpoints necessários**:
- `POST /send/text`, `/send/media`, `/send/pix-button`, `/send/menu`
- `POST /chat/check` — validar número do cliente
- `POST /message/find` — verificar se já enviou recuperação

**Schema de dados necessário**:
- Tabela `cart_recovery_campaigns`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `name TEXT`
  - `trigger_minutes INTEGER` (tempo de abandono)
  - `message_template TEXT`
  - `message_type TEXT` (text, media, pix-button, menu)
  - `pix_key TEXT` (se usar botão PIX)
  - `status TEXT` (active, paused, archived)
  - `created_at TIMESTAMPTZ`
- Tabela `cart_recovery_events`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `campaign_id UUID`
  - `cart_id TEXT` (ID externo do carrinho)
  - `customer_phone TEXT`
  - `customer_name TEXT`
  - `cart_value DECIMAL`
  - `cart_items JSONB`
  - `abandoned_at TIMESTAMPTZ`
  - `message_sent_at TIMESTAMPTZ`
  - `message_id TEXT`
  - `recovered BOOLEAN DEFAULT FALSE`
  - `recovered_at TIMESTAMPTZ`
  - `recovered_value DECIMAL`
  - `status TEXT` (pending, sent, recovered, expired)

**Lógica de negócio no Node.js**:
- **CartRecoveryService**:
  - Escutar webhook externo de carrinho abandonado (Shopify, WooCommerce, etc.)
  - Agendar envio após `trigger_minutes`
  - Enviar mensagem personalizada via adapter
  - Escutar webhook de compra concluída para marcar como recuperado
  - Calcular ROI de recuperação
- **CartRecoveryController**:
  - `POST /api/cart-recovery/campaigns` — criar campanha
  - `GET /api/cart-recovery/campaigns` — listar
  - `POST /api/cart-recovery/webhook/abandoned` — webhook externo de abandono
  - `POST /api/cart-recovery/webhook/recovered` — webhook de compra concluída
  - `GET /api/cart-recovery/stats` — estatísticas de recuperação

**Eventos/webhooks**:
- Webhooks externos (Shopify, WooCommerce)
- `messages_update` da uazapi para tracking

**Dependências**:
- Adapter UAZAPI
- Bull/Redis
- Integrations-core (adapters para e-commerce)
- Wallet/Billing

---

### 4.5. Warmup/Anti-ban (módulo `modules/warmup-core`)

**O que o Bubble faz hoje**:
- Configuração de delays entre mensagens
- Randomização de intervalos
- Presença automática (available/unavailable)
- Configuração de privacidade (last seen, foto, status)
- Uso de proxy

**Endpoints necessários**:
- `POST /instance/updateDelaySettings` — configurar delays (minDelay, maxDelay)
- `POST /instance/presence` — configurar presença
- `POST /instance/privacy` — configurar privacidade (last, online, profile, status, readreceipts)
- `GET /instance/privacy` — consultar privacidade
- `POST /instance/proxy`, `GET /instance/proxy`, `DELETE /instance/proxy` — configurar proxy

**Schema de dados necessário** (expandir tabelas warmup existentes):
- Tabela `warmup_profiles`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `name TEXT` (perfil: conservador, moderado, agressivo, custom)
  - `min_delay_ms INTEGER` (delay mínimo entre mensagens)
  - `max_delay_ms INTEGER` (delay máximo)
  - `presence_mode TEXT` (always_available, smart, unavailable)
  - `privacy_last_seen TEXT` (all, contacts, none)
  - `privacy_online TEXT` (all, match_last_seen)
  - `privacy_profile TEXT` (all, contacts, none)
  - `privacy_status TEXT` (all, contacts, none)
  - `privacy_read_receipts TEXT` (all, none)
  - `use_proxy BOOLEAN`
  - `proxy_config JSONB` (host, port, username, password)
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`
- Vínculo `instance_registry.warmup_profile_id UUID` → `warmup_profiles.id`

**Lógica de negócio no Node.js**:
- **WarmupService**:
  - Aplicar perfil de warmup a instância via `/instance/updateDelaySettings`
  - Configurar presença via `/instance/presence`
  - Configurar privacidade via `/instance/privacy`
  - Configurar proxy via `/instance/proxy`
  - Monitorar health da instância (desconexões, banimentos)
  - Ajustar delays dinamicamente baseado em histórico de envios
  - Randomizar delays dentro do range configurado
- **WarmupController**:
  - `GET /api/warmup/profiles` — listar perfis
  - `POST /api/warmup/profiles` — criar perfil
  - `PUT /api/warmup/profiles/:id` — atualizar perfil
  - `POST /api/warmup/instances/:id/apply-profile` — aplicar perfil a instância

**Eventos/webhooks**:
- `connection`: monitorar desconexões
- Eventos internos de envio para calcular taxa e ajustar delays

**Dependências**:
- Adapter UAZAPI
- Providers (instance_registry)

---

### 4.6. Gestão de Instâncias (módulo `modules/providers`)

**O que o Bubble faz hoje**:
- Criar instância
- Conectar (QR code / paircode)
- Listar instâncias
- Desconectar
- Reset
- Deletar
- Visualizar status (connected, disconnected, connecting)
- Limites de mensagens WhatsApp
- Atualizar nome e campos admin

**Endpoints necessários**:
- `POST /instance/create` — criar (admin)
- `GET /instance/all` — listar (admin)
- `POST /instance/connect` — conectar e gerar QR
- `POST /instance/disconnect` — desconectar
- `POST /instance/reset` — reset
- `DELETE /instance` — deletar
- `GET /instance/status` — status atual
- `GET /instance/wa_messages_limits` — limites WhatsApp
- `POST /instance/updateInstanceName` — atualizar nome
- `POST /instance/updateAdminFields` — atualizar campos customizados

**Schema de dados necessário** (já existe em migration 012):
- `provider_accounts`: pools de contas UAZAPI
- `provider_account_assignments`: vínculo tenant → provider account
- `api_leases`: leases temporários/persistentes
- `instance_registry`: registro de instâncias
- Campos já existentes suficientes, adicionar:
  - `instance_registry.qr_code TEXT` (QR atual)
  - `instance_registry.paircode TEXT` (paircode atual)
  - `instance_registry.wa_messages_limits JSONB` (limites WhatsApp)

**Lógica de negócio no Node.js**:
- **ProviderService** (já existe em `modules/providers/provider.service.js`):
  - Criar instância via adapter e registrar em `instance_registry`
  - Conectar e expor QR/paircode para frontend (SSE ou polling)
  - Monitorar status via webhook `connection`
  - Listar instâncias do tenant
  - Desconectar, reset, deletar com validação de tenant
  - Atualizar adminFields com `tenant_id`, `user_id` para rastreamento
  - Gerenciar leases (free 1h, paid persistent)
- **ProviderController**:
  - `POST /api/instances` — criar instância
  - `GET /api/instances` — listar instâncias do tenant
  - `GET /api/instances/:id` — detalhes da instância
  - `POST /api/instances/:id/connect` — conectar e obter QR
  - `POST /api/instances/:id/disconnect` — desconectar
  - `POST /api/instances/:id/reset` — reset
  - `DELETE /api/instances/:id` — deletar
  - `GET /api/instances/:id/status` — status atual
  - `GET /api/instances/:id/limits` — limites WhatsApp

**Eventos/webhooks**:
- `connection`: atualizar status da instância (connected, disconnected, qr, paircode)

**Dependências**:
- Adapter UAZAPI
- Billing (dedução de créditos por instância ativa)
- Wallet

---

### 4.7. Grupos/Comunidades (novo módulo `modules/groups`)

**O que o Bubble faz hoje**:
- (Geralmente não exposto no Bubble, mas pode ser útil para backend)

**Endpoints necessários**:
- `POST /group/create` — criar grupo
- `POST /group/info` — info do grupo
- `POST /group/join` — entrar via link
- `POST /group/leave` — sair
- `GET /group/list` — listar grupos
- `POST /community/create` — criar comunidade
- `POST /community/editgroups` — editar grupos da comunidade

**Schema de dados necessário**:
- Tabela `whatsapp_groups`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `instance_id TEXT NOT NULL`
  - `group_id TEXT NOT NULL` (ID WhatsApp)
  - `group_name TEXT`
  - `group_subject TEXT`
  - `group_description TEXT`
  - `group_icon_url TEXT`
  - `is_admin BOOLEAN`
  - `is_member BOOLEAN`
  - `is_announce BOOLEAN` (somente anúncios)
  - `participants JSONB` (array de participantes)
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **GroupsService**:
  - Criar grupo via adapter
  - Listar grupos da instância
  - Entrar/sair de grupos
  - Sincronizar participantes
  - Enviar mensagens para grupo
- **GroupsController**:
  - `POST /api/groups` — criar grupo
  - `GET /api/groups` — listar grupos
  - `GET /api/groups/:id` — detalhes
  - `POST /api/groups/:id/join` — entrar
  - `POST /api/groups/:id/leave` — sair
  - `POST /api/groups/:id/messages` — enviar mensagem

**Eventos/webhooks**:
- `groups`: alterações em grupos

**Dependências**:
- Adapter UAZAPI
- Inbox (mensagens de grupo)

---

### 4.8. Newsletters/Canais (novo módulo `modules/newsletters`)

**O que o Bubble faz hoje**:
- (Geralmente não exposto, recurso novo do WhatsApp)

**Endpoints necessários**:
- Todos os 25 endpoints de `/newsletter/*`

**Schema de dados necessário**:
- Tabela `whatsapp_newsletters`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `instance_id TEXT NOT NULL`
  - `newsletter_id TEXT NOT NULL` (ID WhatsApp)
  - `name TEXT`
  - `description TEXT`
  - `picture_url TEXT`
  - `subscribers_count INTEGER`
  - `is_owner BOOLEAN`
  - `is_admin BOOLEAN`
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **NewsletterService**:
  - Criar/gerenciar canais
  - Enviar mensagens para canal
  - Gerenciar admins
  - Tracking de visualizações e reações
- **NewsletterController**:
  - `POST /api/newsletters` — criar canal
  - `GET /api/newsletters` — listar
  - `POST /api/newsletters/:id/messages` — enviar mensagem
  - `GET /api/newsletters/:id/stats` — estatísticas

**Eventos/webhooks**:
- `newsletter_messages`: mensagens do canal

**Dependências**:
- Adapter UAZAPI

---

### 4.9. Webhooks/Eventos (módulo `modules/webhook-core`)

**O que o Bubble faz hoje**:
- Configurar webhook URL para receber eventos
- Filtrar eventos (messages, connection, presence, etc.)
- Excluir tipos de mensagens (fromMe, isGroup, etc.)

**Endpoints necessários**:
- `GET /webhook`, `POST /webhook` — configurar webhook por instância
- `GET /webhook/errors` — erros do webhook
- `GET /globalwebhook`, `POST /globalwebhook` — global webhook (admin)
- `GET /globalwebhook/errors` — erros global
- `GET /sse` — stream de eventos em tempo real

**Schema de dados necessário** (já existe em migration 014):
- `integration_webhook_events`: inbox durável para webhooks brutos
- `internal_events`: eventos canônicos normalizados
- Adicionar:
  - `webhook_configurations`:
    - `id UUID PRIMARY KEY`
    - `tenant_id UUID NOT NULL`
    - `instance_id TEXT` (NULL para global)
    - `url TEXT NOT NULL`
    - `events TEXT[]` (array de eventos: messages, connection, etc.)
    - `exclude_filters TEXT[]` (wasSentByApi, fromMeYes, etc.)
    - `status TEXT` (active, paused, error)
    - `error_count INTEGER`
    - `last_error TEXT`
    - `last_success_at TIMESTAMPTZ`
    - `created_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **WebhookCoreService** (já existe):
  - Receber webhooks da uazapi em `/api/webhooks/uazapi`
  - Validar assinatura (se houver)
  - Persistir raw payload em `integration_webhook_events`
  - Deduplicar por `external_event_id`
  - Normalizar para evento interno (`internal_events`)
  - Despachar para filas Bull para processamento assíncrono
  - Processar eventos: atualizar `uazapi_chats`, `uazapi_messages`, `uazapi_contacts`, `uazapi_presence`, `uazapi_connection`
  - Emitir eventos internos para billing, wallet, campaigns
- **WebhookController**:
  - `POST /api/webhooks/uazapi` — receber webhooks da uazapi
  - `GET /api/webhook-configs` — listar configs de webhook
  - `POST /api/webhook-configs` — criar/atualizar config
  - `GET /api/webhook-configs/:id/errors` — erros do webhook

**Eventos/webhooks da UAZAPI**:
- `connection`: status de conexão (connected, disconnected, qr, paircode)
- `history`: sincronização de histórico
- `messages`: nova mensagem
- `messages_update`: status de mensagem (delivered, read)
- `newsletter_messages`: mensagem de canal
- `call`: chamada recebida
- `contacts`: contato atualizado
- `presence`: status online/typing
- `groups`: alterações em grupos
- `labels`: alterações em etiquetas
- `chats`: alterações em chats
- `chat_labels`: etiquetas de chat
- `blocks`: bloqueios
- `sender`: eventos de campanha nativa

**Dependências**:
- Adapter UAZAPI (configurar webhook via adapter)
- Bull/Redis
- Todos os módulos que consomem eventos (inbox, campaigns, warmup, billing)

---

### 4.10. Business Profile (novo módulo `modules/business` ou expandir `modules/providers`)

**O que o Bubble faz hoje**:
- (Geralmente não exposto)

**Endpoints necessários**:
- `POST /business/get/profile` — obter perfil
- `GET /business/get/categories` — categorias
- `POST /business/update/profile` — atualizar perfil
- `POST /business/catalog/*` — gerenciar catálogo

**Schema de dados necessário**:
- Tabela `business_profiles`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `instance_id TEXT NOT NULL`
  - `business_name TEXT`
  - `business_category TEXT`
  - `business_description TEXT`
  - `business_address TEXT`
  - `business_email TEXT`
  - `business_website TEXT`
  - `business_hours JSONB`
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`
- Tabela `business_catalog_items`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `instance_id TEXT NOT NULL`
  - `item_id TEXT` (ID WhatsApp)
  - `name TEXT`
  - `description TEXT`
  - `price DECIMAL`
  - `currency TEXT`
  - `image_url TEXT`
  - `is_visible BOOLEAN`
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **BusinessService**:
  - Sincronizar perfil business
  - Atualizar perfil
  - Gerenciar catálogo de produtos
  - Exibir catálogo em carrossel
- **BusinessController**:
  - `GET /api/business/profile` — obter perfil
  - `PUT /api/business/profile` — atualizar perfil
  - `GET /api/business/catalog` — listar produtos
  - `POST /api/business/catalog` — criar produto
  - `PUT /api/business/catalog/:id` — atualizar produto
  - `DELETE /api/business/catalog/:id` — deletar produto

**Eventos/webhooks**:
- (Nenhum evento específico de business na OpenAPI atual)

**Dependências**:
- Adapter UAZAPI

---

### 4.11. Chatbot/IA (novo módulo `modules/chatbot` ou expandir `modules/inbox`)

**O que o Bubble faz hoje**:
- (Pode ter chatbot básico, mas geralmente feito via Bubble workflows)

**Endpoints necessários**:
- Configuração via `instance` schema:
  - `openai_apikey` — chave OpenAI
  - `chatbot_enabled` — habilitar chatbot
  - `chatbot_ignoreGroups` — ignorar grupos
  - `chatbot_stopConversation` — palavra-chave de parada
  - `chatbot_stopMinutes` — tempo de pausa
  - `chatbot_stopWhenYouSendMsg` — pausar ao enviar manualmente

**Schema de dados necessário**:
- Tabela `chatbot_configurations`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `instance_id TEXT NOT NULL`
  - `provider TEXT` (openai, custom, webhook)
  - `api_key_enc TEXT` (criptografado)
  - `model TEXT` (gpt-4, gpt-3.5-turbo)
  - `system_prompt TEXT`
  - `temperature DECIMAL`
  - `max_tokens INTEGER`
  - `ignore_groups BOOLEAN`
  - `stop_keyword TEXT`
  - `stop_duration_minutes INTEGER`
  - `auto_pause_on_manual_reply BOOLEAN`
  - `status TEXT` (active, paused)
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`
- Tabela `chatbot_conversations`:
  - `id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `instance_id TEXT NOT NULL`
  - `chat_id TEXT NOT NULL`
  - `contact_phone TEXT`
  - `is_paused BOOLEAN DEFAULT FALSE`
  - `paused_until TIMESTAMPTZ`
  - `context JSONB` (histórico de mensagens)
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`

**Lógica de negócio no Node.js**:
- **ChatbotService**:
  - Escutar webhook `messages` de mensagens recebidas
  - Verificar se chatbot está habilitado para a instância
  - Verificar se conversa está pausada
  - Consultar histórico de conversa (`context`)
  - Chamar OpenAI API com system_prompt + context + mensagem atual
  - Enviar resposta via adapter
  - Atualizar `context` com mensagem e resposta
  - Detectar palavra-chave de parada e pausar conversa
  - Pausar ao receber mensagem manual do atendente
- **ChatbotController**:
  - `GET /api/chatbot/config` — obter config
  - `PUT /api/chatbot/config` — atualizar config
  - `POST /api/chatbot/pause/:chatId` — pausar chatbot em conversa
  - `POST /api/chatbot/resume/:chatId` — retomar chatbot

**Eventos/webhooks**:
- `messages`: processar mensagem e enviar resposta

**Dependências**:
- Adapter UAZAPI
- OpenAI API
- Inbox (histórico de mensagens)
- Secrets vault (armazenar API key criptografada)

---

## 5. Plano de Migração em Fases

### Fase 1 — Substituir Bubble Mantendo UAZAPI (Menor Risco)

**Objetivo**: Migrar funcionalidades que reduzem dependência do Bubble com menor risco operacional e maior retorno rápido.

**Escopo**:
1. **Gestão de Instâncias** (criar, conectar, listar, desconectar, reset, deletar)
2. **Inbox básico** (listar conversas, ver mensagens, enviar texto/mídia)
3. **Webhooks** (configurar e receber eventos)
4. **Contatos** (listar, buscar)

**Endpoints da UAZAPI**:
- Administração: `/instance/create`, `/instance/all`, `/instance/connect`, `/instance/disconnect`, `/instance/reset`, `/instance/status`, `DELETE /instance`
- Mensagens: `/send/text`, `/send/media`
- Chats: `/chat/find`, `/chat/details`
- Mensagens: `/message/find`, `/message/history-sync`, `/message/markread`
- Contatos: `/contacts`, `/contacts/list`
- Webhooks: `POST /webhook`, `GET /webhook`

**Migrations necessárias**:
- ✅ Já existe: migration 012 (provider_accounts, api_leases, instance_registry)
- ✅ Já existe: migration 017 (uazapi_chats, uazapi_messages, uazapi_contacts, uazapi_presence, uazapi_connection, uazapi_webhook_events)
- ⚠️ Adicionar: `webhook_configurations` (config de webhook por instância)
- ⚠️ Adicionar: campos `qr_code`, `paircode`, `wa_messages_limits` em `instance_registry`

**Lógica de negócio**:
- `ProviderService`: criar, conectar, listar, desconectar, reset, deletar instâncias
- `InboxService`: listar conversas, buscar mensagens, enviar texto/mídia
- `WebhookCoreService`: receber e processar webhooks, salvar em `uazapi_messages`, `uazapi_chats`

**Rotas HTTP**:
- `POST /api/instances` → criar instância
- `GET /api/instances` → listar instâncias do tenant
- `GET /api/instances/:id` → detalhes
- `POST /api/instances/:id/connect` → conectar e obter QR
- `POST /api/instances/:id/disconnect` → desconectar
- `POST /api/instances/:id/reset` → reset
- `DELETE /api/instances/:id` → deletar
- `GET /api/inbox/chats` → listar conversas
- `GET /api/inbox/chats/:chatId/messages` → mensagens da conversa
- `POST /api/inbox/chats/:chatId/messages` → enviar mensagem
- `POST /api/inbox/chats/:chatId/mark-read` → marcar como lida
- `POST /api/webhooks/uazapi` → receber webhooks

**Dependências**:
- Adapter UAZAPI (`modules/provider-adapter/uazapi-adapter.js`) ✅ já existe
- Webhook core (`modules/webhook-core`) ✅ já existe
- Wallet (dedução de créditos por mensagem enviada)

**Riscos**:
- Latência de webhooks (pode haver delay de alguns segundos)
- QR code expira rápido (60s), precisa SSE ou polling rápido
- Histórico de mensagens pode ser grande (paginar)

**Critérios de aceite**:
- ✅ Cliente consegue criar instância via painel Ruptur
- ✅ Cliente consegue conectar instância e ver QR code
- ✅ Cliente vê lista de conversas sincronizadas
- ✅ Cliente consegue enviar mensagem de texto
- ✅ Cliente consegue enviar imagem/vídeo
- ✅ Mensagens recebidas aparecem em tempo real (via webhook)
- ✅ Créditos são deduzidos ao enviar mensagem

**Frontend (React SPA)**:
- Tela de instâncias (`/admin/instances`)
- Tela de inbox (`/inbox`)
- Componente de QR code (polling ou SSE)
- Componente de lista de conversas
- Componente de chat (histórico + envio)

---

### Fase 2 — Backend Próprio Completo (Inbox Nativo, CRM, Campanhas)

**Objetivo**: Consolidar inbox, CRM e campanhas nativas no backend Ruptur, eliminando completamente o Bubble.

**Escopo**:
1. **Inbox completo** (etiquetas, notas, arquivar, fixar, silenciar, reações, respostas rápidas, presença)
2. **CRM/Pipeline** (leads, campos customizados, funil)
3. **Campanhas de Disparo** (criar, agendar, disparar, tracking)
4. **Recuperação de Carrinho** (detectar abandono, enviar recuperação, tracking)
5. **Warmup/Anti-ban** (delays, presença, privacidade, proxy)
6. **Grupos** (criar, listar, entrar, sair)
7. **Business Profile** (perfil business, catálogo)
8. **Chatbot/IA** (chatbot com OpenAI)

**Endpoints da UAZAPI** (adicionar aos já implementados na Fase 1):
- Mensagens: `/send/menu`, `/send/carousel`, `/send/pix-button`, `/send/contact`, `/send/location`, `/message/react`, `/message/delete`, `/message/edit`, `/message/pin`, `/message/presence`, `/message/download`
- Chats: `/chat/archive`, `/chat/mute`, `/chat/pin`, `/chat/block`, `/chat/labels`
- Etiquetas: `/labels`, `/labels/refresh`, `/label/edit`
- Notas: `/chat/notes`, `/chat/notes/refresh`, `/chat/notes/edit`
- Respostas rápidas: `/quickreply/showall`, `/quickreply/edit`
- Warmup: `/instance/updateDelaySettings`, `/instance/presence`, `/instance/privacy`, `/instance/proxy`
- Grupos: `/group/create`, `/group/info`, `/group/join`, `/group/leave`, `/group/list`
- Business: `/business/get/profile`, `/business/update/profile`, `/business/catalog/*`
- Campanhas: `/sender/simple`, `/sender/advanced` (ou usar envio unitário em fila)
- Chatbot: configuração via `instance` fields (`openai_apikey`, `chatbot_enabled`)

**Migrations necessárias**:
- ⚠️ `uazapi_quick_replies` (respostas rápidas)
- ⚠️ `uazapi_chat_notes` (notas internas, se não usar `chat/notes` da uazapi)
- ⚠️ `crm_leads` (leads e pipeline)
- ⚠️ Expandir `campaigns` e criar `campaign_recipients`
- ⚠️ `cart_recovery_campaigns` e `cart_recovery_events`
- ⚠️ `warmup_profiles`
- ⚠️ `whatsapp_groups`
- ⚠️ `business_profiles` e `business_catalog_items`
- ⚠️ `chatbot_configurations` e `chatbot_conversations`

**Lógica de negócio**:
- **InboxService**: etiquetas, notas, arquivar, fixar, silenciar, reações, respostas rápidas, presença, download de mídia
- **CRMService**: criar/atualizar leads, mover entre etapas, campos customizados
- **CampaignService**: criar campanha, importar CSV, validar números, agendar, disparar com delays, tracking
- **CartRecoveryService**: escutar abandono, agendar envio, enviar mensagem, tracking de conversão
- **WarmupService**: aplicar perfil de delays, presença, privacidade, proxy
- **GroupsService**: criar, listar, entrar, sair de grupos
- **BusinessService**: sincronizar perfil, gerenciar catálogo
- **ChatbotService**: processar mensagens, chamar OpenAI, enviar respostas, pausar/retomar

**Rotas HTTP** (adicionar às da Fase 1):
- Inbox:
  - `POST /api/inbox/chats/:chatId/archive`
  - `POST /api/inbox/chats/:chatId/mute`
  - `POST /api/inbox/chats/:chatId/pin`
  - `POST /api/inbox/messages/:messageId/react`
  - `POST /api/inbox/messages/:messageId/delete`
  - `GET /api/inbox/labels`
  - `POST /api/inbox/labels`
  - `GET /api/inbox/quick-replies`
  - `POST /api/inbox/quick-replies`
- CRM:
  - `GET /api/crm/leads`
  - `GET /api/crm/leads/:id`
  - `PUT /api/crm/leads/:id`
  - `POST /api/crm/leads/:id/stage`
  - `GET /api/crm/pipeline`
- Campanhas:
  - `POST /api/campaigns`
  - `GET /api/campaigns`
  - `GET /api/campaigns/:id`
  - `POST /api/campaigns/:id/start`
  - `POST /api/campaigns/:id/pause`
  - `DELETE /api/campaigns/:id`
- Recuperação de Carrinho:
  - `POST /api/cart-recovery/campaigns`
  - `POST /api/cart-recovery/webhook/abandoned`
  - `POST /api/cart-recovery/webhook/recovered`
- Warmup:
  - `GET /api/warmup/profiles`
  - `POST /api/warmup/profiles`
  - `POST /api/warmup/instances/:id/apply-profile`
- Grupos:
  - `POST /api/groups`
  - `GET /api/groups`
  - `POST /api/groups/:id/join`
- Business:
  - `GET /api/business/profile`
  - `PUT /api/business/profile`
  - `GET /api/business/catalog`
  - `POST /api/business/catalog`
- Chatbot:
  - `GET /api/chatbot/config`
  - `PUT /api/chatbot/config`
  - `POST /api/chatbot/pause/:chatId`

**Dependências**:
- Adapter UAZAPI
- Webhook core
- Bull/Redis para filas (campanhas, chatbot, cart recovery)
- Wallet/Billing (dedução de créditos)
- OpenAI API (chatbot)
- Secrets vault (armazenar API keys criptografadas)

**Riscos**:
- Complexidade de filas e processamento assíncrono
- Rate limiting da uazapi (precisa respeitar delays)
- Consumo de créditos em massa (campanhas grandes)
- Banimento por envio agressivo (precisa warmup correto)
- Histórico de conversas grande (precisa paginação e índices otimizados)
- Latência de chatbot (chamada OpenAI pode demorar)

**Critérios de aceite**:
- ✅ Cliente consegue criar campanha e importar CSV
- ✅ Campanha dispara com delays configurados
- ✅ Estatísticas de entrega/leitura são atualizadas em tempo real
- ✅ Cliente consegue criar lead a partir de conversa
- ✅ Cliente consegue mover lead entre etapas do pipeline
- ✅ Cliente consegue configurar warmup (delays, presença, privacidade, proxy)
- ✅ Chatbot responde mensagens automaticamente
- ✅ Chatbot pausa ao enviar mensagem manual
- ✅ Recuperação de carrinho envia mensagem após abandono
- ✅ Cliente consegue gerenciar catálogo de produtos
- ✅ Créditos são deduzidos corretamente

**Frontend (React SPA)**:
- Tela de CRM/Leads (`/crm/leads`, `/crm/pipeline`)
- Tela de Campanhas (`/campaigns`)
- Tela de Recuperação de Carrinho (`/cart-recovery`)
- Tela de Warmup (`/admin/warmup`)
- Tela de Grupos (`/groups`)
- Tela de Business Profile (`/business`)
- Tela de Chatbot (`/admin/chatbot`)

---

### Fase 3 — Soberania Total (Evolution API Self-Hosted)

**Objetivo**: Preparar abstração para troca futura da uazapi por Evolution API self-hosted, sem reescrever os motores internos.

**Escopo**:
1. **Contratos de Provider**: abstração de capacidades (`IProviderAdapter`)
2. **Normalização de Eventos**: mapear eventos da uazapi e Evolution API para eventos internos canônicos
3. **Compatibilidade de Schemas**: garantir que dados de conversas, mensagens, contatos sejam agnósticos
4. **Testes de Paridade**: validar que funcionalidades críticas funcionam com ambos os providers
5. **Deploy de Evolution API**: hospedar instância self-hosted
6. **Migração de Instâncias**: ferramentas para migrar instâncias de uazapi para Evolution API

**Endpoints Evolution API** (principais):
- `/instance/create` → criar instância
- `/instance/connect` → conectar (QR)
- `/instance/logout` → desconectar
- `/instance/delete` → deletar
- `/instance/connectionState` → status
- `/message/sendText` → enviar texto
- `/message/sendMedia` → enviar mídia
- `/chat/findMessages` → buscar mensagens
- `/chat/findContacts` → buscar contatos
- `/webhook/set` → configurar webhook
- etc. (Evolution API possui OpenAPI própria, precisa mapear)

**Contratos de Provider** (já existente em `modules/provider-adapter/types.js`):
- `IProviderAdapter`:
  - `listInstances()`
  - `createInstance(payload)`
  - `getInstance(instanceId)`
  - `sendMessage(instanceId, payload)`
  - `sendText(instanceId, payload)`
  - `sendMedia(instanceId, payload)`
  - `sendContact(instanceId, payload)`
  - `sendLocation(instanceId, payload)`
  - `sendMenu(instanceId, payload)`
  - `sendCarousel(instanceId, payload)`
  - `deleteInstance(instanceId)`
  - `connectInstance(instanceId)`
  - `disconnectInstance(instanceId)`
  - `resetInstance(instanceId)`
  - `getContacts(instanceId)`
  - `getChats(instanceId)`
  - `getMessages(instanceId, chatId)`
  - `configureWebhook(instanceId, config)`
  - `updatePresence(instanceId, presence)`
  - `updatePrivacy(instanceId, privacy)`
  - `updateDelaySettings(instanceId, delays)`
  - `normalizeInstance(raw)` → schema interno
  - `normalizeMessage(raw)` → schema interno
  - `normalizeContact(raw)` → schema interno
  - `normalizeWebhookEvent(raw)` → evento interno

**Normalização de Eventos**:
- Criar mapeamento de eventos da uazapi e Evolution API para eventos internos:
  - `message.received` (interno) ← `messages` (uazapi) / `messages.upsert` (Evolution API)
  - `message.updated` (interno) ← `messages_update` (uazapi) / `messages.update` (Evolution API)
  - `instance.connected` (interno) ← `connection` (uazapi) / `connection.update` (Evolution API)
  - `contact.updated` (interno) ← `contacts` (uazapi) / `contacts.upsert` (Evolution API)
  - `presence.updated` (interno) ← `presence` (uazapi) / `presence.update` (Evolution API)
  - etc.

**Migrations necessárias**:
- ⚠️ Adicionar campo `provider_accounts.provider_type` (uazapi, evolution_api)
- ⚠️ Adicionar `provider_adapter_capabilities` (tabela de capacidades por provider)
- ⚠️ Garantir que `uazapi_chats`, `uazapi_messages`, etc. sejam renomeadas para `provider_chats`, `provider_messages` (ou manter genérico)

**Lógica de negócio**:
- **ProviderFactory**: instanciar adapter correto baseado em `provider_type`
  ```js
  function getAdapter(providerAccount) {
    if (providerAccount.provider === 'uazapi') {
      return new UazapiAdapter(credentials);
    }
    if (providerAccount.provider === 'evolution_api') {
      return new EvolutionApiAdapter(credentials);
    }
    throw new Error('Unknown provider');
  }
  ```
- **EventNormalizer**: normalizar eventos de qualquer provider para evento interno
  ```js
  function normalizeEvent(providerType, rawEvent) {
    if (providerType === 'uazapi') {
      return normalizeUazapiEvent(rawEvent);
    }
    if (providerType === 'evolution_api') {
      return normalizeEvolutionApiEvent(rawEvent);
    }
  }
  ```
- **CapabilityChecker**: verificar se provider suporta capacidade antes de chamar
  ```js
  if (adapter.hasCapability('send_carousel')) {
    await adapter.sendCarousel(instanceId, payload);
  } else {
    // fallback ou erro
  }
  ```

**Rotas HTTP** (nenhuma mudança para o cliente, abstração é interna):
- Rotas continuam as mesmas, mas backend escolhe adapter correto

**Dependências**:
- Adapter UAZAPI (`modules/provider-adapter/uazapi-adapter.js`) ✅ já existe
- Adapter Evolution API (`modules/provider-adapter/evolution-api-adapter.js`) ⚠️ criar
- ProviderFactory ⚠️ criar
- EventNormalizer ⚠️ criar
- CapabilityChecker ⚠️ criar

**Riscos**:
- Paridade de funcionalidades (uazapi pode ter recursos que Evolution API não tem e vice-versa)
- Breaking changes em versões futuras de Evolution API
- Dados históricos migrados podem perder contexto
- Downtime durante migração de instâncias
- Necessidade de re-conectar instâncias (QR code novamente)
- Custo de infra self-hosted (servidor, manutenção, escalabilidade)

**Critérios de aceite**:
- ✅ Sistema consegue criar instância tanto na uazapi quanto na Evolution API
- ✅ Sistema consegue enviar mensagem via ambos os providers
- ✅ Webhooks de ambos os providers são normalizados corretamente
- ✅ Motores internos (billing, wallet, campaigns) funcionam independente do provider
- ✅ Frontend não precisa saber qual provider está sendo usado
- ✅ Migramos pelo menos 1 tenant piloto de uazapi para Evolution API com sucesso
- ✅ Documentação de migração está completa

**Frontend (React SPA)**:
- Nenhuma mudança visual, mas adicionar:
  - Configuração de provider preferido (Admin/Superadmin)
  - Ferramentas de migração de instâncias (Admin/Superadmin)

---

## 6. Decisões Arquiteturais

### 6.1. Cliente HTTP da UAZAPI

**Implementação**: `modules/provider-adapter/uazapi-adapter.js` (já existe)

**Autenticação**:
- Endpoints administrativos: header `admintoken`
- Endpoints de instância: header `token` (token da instância)

**Timeouts**:
- Padrão: 30s
- Endpoints longos (history-sync, download): 60s
- SSE: sem timeout (stream contínuo)

**Retry Seletivo**:
- Retry em erros de rede (ECONNRESET, ETIMEDOUT)
- Retry em 429 (rate limit) com exponential backoff
- Retry em 502/503/504 (server error)
- **NÃO** retry em 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found)
- Máximo de 3 tentativas

**Circuit Breaker**:
- Após 5 falhas consecutivas para o mesmo endpoint, abrir circuit por 60s
- Durante circuit aberto, retornar erro imediatamente sem tentar
- Após 60s, tentar novamente (half-open)
- Se sucesso, fechar circuit; se falha, abrir novamente

**Observabilidade**:
- Logar todas as chamadas (método, path, status, latência)
- Métricas: taxa de sucesso, latência p50/p95/p99, taxa de erro por endpoint
- Alertas: taxa de erro > 5%, latência p95 > 5s, circuit aberto

**Implementação sugerida**:
```js
import pRetry from 'p-retry';
import CircuitBreaker from 'opossum';

const breakerOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 60000,
};

const breaker = new CircuitBreaker(fetchJson, breakerOptions);

async function callUazapi(url, options) {
  return pRetry(
    () => breaker.fire(url, options),
    {
      retries: 3,
      onFailedAttempt: (error) => {
        if ([400, 401, 403, 404].includes(error.statusCode)) {
          throw new AbortError('Non-retryable error');
        }
      },
    }
  );
}
```

---

### 6.2. Ingestão de Webhooks

**Fluxo**:
1. **Recebimento rápido**: controller responde 200 OK em <100ms
2. **Persistência raw**: salvar payload completo em `integration_webhook_events` (tabela durável)
3. **Deduplicação**: verificar `external_event_id` para evitar processar duplicado
4. **Normalização**: converter payload do provider para evento interno canônico
5. **Processamento assíncrono**: enfileirar job Bull para processar evento

**Implementação**:
```js
// api/controllers/webhooks.controller.js
export async function receiveUazapiWebhook(req, res) {
  const rawPayload = req.body;
  const eventType = req.body.event || 'unknown';
  const externalEventId = req.body.id || req.body.messageId || `${Date.now()}_${Math.random()}`;

  // 1. Persistir raw
  const event = await webhookCore.saveRawEvent({
    tenant_id: extractTenantFromPayload(rawPayload),
    integration_type: 'uazapi',
    event_type: eventType,
    external_event_id: externalEventId,
    raw_payload: rawPayload,
  });

  // 2. Enfileirar processamento
  await webhookQueue.add('process-uazapi-webhook', { eventId: event.id });

  // 3. Responder rápido
  res.status(200).json({ ok: true });
}

// modules/webhook-core/processor.js
export async function processWebhookEvent(eventId) {
  const event = await webhookCore.getEvent(eventId);

  // Deduplicar
  if (event.processed) return;

  // Normalizar
  const internalEvent = normalizeUazapiEvent(event.raw_payload);

  // Salvar evento interno
  await internalEvents.create(internalEvent);

  // Atualizar tabelas específicas
  if (internalEvent.type === 'message.received') {
    await inboxService.saveMessage(internalEvent.data);
  }
  if (internalEvent.type === 'instance.connected') {
    await providerService.updateInstanceStatus(internalEvent.data);
  }

  // Marcar como processado
  await webhookCore.markProcessed(eventId);
}
```

**Deduplicação**:
- Chave única: `(integration_type, external_event_id)`
- Constraint em `integration_webhook_events`:
  ```sql
  CREATE UNIQUE INDEX idx_webhook_events_external_id ON integration_webhook_events(integration_type, external_event_id);
  ```

**Normalização**:
- Mapear campos do provider para schema interno:
  ```js
  function normalizeUazapiEvent(rawPayload) {
    if (rawPayload.event === 'messages') {
      return {
        type: 'message.received',
        tenant_id: extractTenantFromPayload(rawPayload),
        instance_id: rawPayload.instance_id,
        data: {
          message_id: rawPayload.data.key.id,
          chat_id: rawPayload.data.key.remoteJid,
          sender_phone: extractPhoneFromJid(rawPayload.data.key.participant || rawPayload.data.key.remoteJid),
          body: rawPayload.data.message?.conversation || rawPayload.data.message?.extendedTextMessage?.text,
          message_type: detectMessageType(rawPayload.data.message),
          timestamp: new Date(rawPayload.data.messageTimestamp * 1000),
          is_from_me: rawPayload.data.key.fromMe,
        },
      };
    }
    // ... outros tipos de evento
  }
  ```

**Processamento Assíncrono**:
- Fila Bull dedicada: `webhook-processing`
- Concurrency: 10 jobs paralelos
- Retry: 3 tentativas com exponential backoff
- Dead letter queue: jobs que falharem 3 vezes vão para fila `webhook-dead-letter` para análise manual

---

### 6.3. Multi-Tenant

**Separação**:
- Todas as tabelas têm `tenant_id UUID NOT NULL`
- RLS habilitado em todas as tabelas sensíveis
- Queries sempre filtram por `tenant_id`

**Vínculos**:
- `provider_accounts` → `provider_account_assignments` → `tenants`
- `instance_registry.tenant_id` → `tenants.id`
- `uazapi_chats.tenant_id` → `tenants.id`
- `uazapi_messages.tenant_id` → `tenants.id`
- `campaigns.tenant_id` → `tenants.id`

**RLS Policies**:
```sql
-- Exemplo: uazapi_chats
CREATE POLICY "uazapi_chats_select_own_tenant" ON public.uazapi_chats
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenant_memberships
      WHERE user_id = auth.uid()
    )
  );
```

**Autenticação/Autorização**:
- Middleware extrai `user_id` do JWT (Supabase Auth)
- Middleware busca `tenant_id` via `user_tenant_memberships`
- Middleware injeta `tenant_id` no contexto da request
- Services sempre recebem `tenant_id` como parâmetro obrigatório

**Escopo em Filas**:
- Jobs Bull incluem `tenant_id` no payload
- Ao processar job, validar que `tenant_id` existe
- Logs incluem `tenant_id` para rastreamento

---

### 6.4. Rate Limiting

**Por Tenant**:
- Limite de mensagens por minuto por tenant: configurável por plano (ex: free=10/min, paid=100/min)
- Implementação: Redis com chave `rate_limit:tenant:{tenant_id}:messages`
- Algoritmo: Token bucket ou sliding window

**Por Instância**:
- Limite de mensagens por minuto por instância: configurável (ex: 60/min)
- Chave Redis: `rate_limit:instance:{instance_id}:messages`
- Respeitar limites da uazapi (consultar `/instance/wa_messages_limits`)

**Por Tipo de Operação**:
- Criação de instâncias: 5/hora por tenant
- Conexões simultâneas: 3 tentativas/min por instância
- Upload de CSV para campanha: 10MB máximo, 1/min

**Proteção Anti-Ban**:
- Warmup obrigatório para instâncias novas (delays mínimos)
- Detecção de padrões suspeitos (envio para muitos números desconhecidos em curto período)
- Rate limit dinâmico baseado em histórico de banimentos

**Fairness**:
- Em caso de capacity_full em `provider_account`, enfileirar requests e processar FIFO
- Prioridade para tenants pagos sobre free
- Alertas para superadmin quando tenant está consistentemente no limite

**Implementação sugerida**:
```js
import RateLimiterRedis from 'rate-limiter-flexible';

const tenantLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit:tenant',
  points: 100, // mensagens
  duration: 60, // por minuto
});

async function checkRateLimit(tenantId) {
  try {
    await tenantLimiter.consume(tenantId, 1);
  } catch (error) {
    throw new RateLimitError('Tenant rate limit exceeded');
  }
}
```

---

### 6.5. Abstração para Evolution API

**Contratos de Provider** (já existente em `modules/provider-adapter/types.js`):
- Interface `IProviderAdapter` com métodos abstratos
- `UazapiAdapter extends IProviderAdapter`
- `EvolutionApiAdapter extends IProviderAdapter` (futuro)

**Normalização de Contatos/Conversas/Mensagens**:
- Schema interno agnóstico:
  ```js
  // Conversa
  {
    id: UUID,
    tenant_id: UUID,
    instance_id: TEXT,
    chat_id: TEXT, // ID do provider (pode ser diferente entre uazapi e Evolution API)
    contact_phone: TEXT,
    contact_name: TEXT,
    last_message: TEXT,
    last_message_timestamp: TIMESTAMPTZ,
    unread_count: INTEGER,
    status: TEXT,
    is_group: BOOLEAN,
    metadata: JSONB, // campos específicos do provider
  }

  // Mensagem
  {
    id: UUID,
    tenant_id: UUID,
    chat_id: TEXT,
    message_id: TEXT, // ID do provider
    sender_phone: TEXT,
    body: TEXT,
    message_type: TEXT, // text, image, video, audio, document, sticker, location, contact
    media_url: TEXT,
    timestamp: TIMESTAMPTZ,
    is_from_me: BOOLEAN,
    status: TEXT, // sent, delivered, read
    metadata: JSONB,
  }
  ```

**Adapter Factory**:
```js
// modules/provider-adapter/factory.js
export function createProviderAdapter(providerAccount) {
  const { provider, server_url, admin_token_enc } = providerAccount;

  if (provider === 'uazapi') {
    return new UazapiAdapter({
      serverUrl: server_url,
      adminToken: decrypt(admin_token_enc),
    });
  }

  if (provider === 'evolution_api') {
    return new EvolutionApiAdapter({
      serverUrl: server_url,
      apiKey: decrypt(admin_token_enc),
    });
  }

  throw new Error(`Unknown provider: ${provider}`);
}
```

**Normalização de Eventos**:
```js
// modules/webhook-core/normalizers/index.js
export function normalizeWebhookEvent(providerType, rawPayload) {
  if (providerType === 'uazapi') {
    return normalizeUazapiEvent(rawPayload);
  }
  if (providerType === 'evolution_api') {
    return normalizeEvolutionApiEvent(rawPayload);
  }
  throw new Error(`Unknown provider: ${providerType}`);
}
```

**Capacidades por Provider**:
- Tabela `provider_capabilities`:
  ```sql
  CREATE TABLE IF NOT EXISTS provider_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL, -- uazapi, evolution_api
    capability TEXT NOT NULL, -- send_text, send_media, send_menu, send_carousel, send_pix_button, etc.
    supported BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- Antes de chamar método do adapter, verificar se provider suporta:
  ```js
  const capabilities = await getProviderCapabilities(providerAccount.provider);
  if (!capabilities.send_carousel) {
    throw new Error('Provider does not support carousel messages');
  }
  ```

---

### 6.6. Filas Bull

**Filas principais**:
1. **`webhook-processing`**: processar eventos de webhook
2. **`message-send`**: enviar mensagens (campanhas, chatbot, cart recovery)
3. **`campaign-dispatch`**: disparar campanhas em lote
4. **`cart-recovery-trigger`**: enviar recuperação de carrinho
5. **`chatbot-response`**: processar resposta de chatbot
6. **`instance-sync`**: sincronizar histórico de conversas/mensagens
7. **`warmup-maintenance`**: ajustar delays e presença
8. **`billing-ledger`**: registrar uso para billing

**Configuração**:
- Concurrency: 10 jobs por fila
- Retry: 3 tentativas com exponential backoff (1s, 5s, 25s)
- Timeout: 30s por job
- Dead letter queue: jobs que falharem 3x vão para fila `{queue-name}-dead-letter`

**Implementação**:
```js
import Bull from 'bull';

const webhookQueue = new Bull('webhook-processing', {
  redis: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 30000,
  },
});

webhookQueue.process(10, async (job) => {
  await processWebhookEvent(job.data.eventId);
});

webhookQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
  // Enviar para dead letter queue ou alertar admin
});
```

**Prioridade**:
- Jobs de alta prioridade (mensagens de atendimento humano): priority=1
- Jobs de média prioridade (chatbot, cart recovery): priority=5
- Jobs de baixa prioridade (campanhas): priority=10

**Scheduling**:
- Campanhas agendadas: usar Bull `delayed jobs`
  ```js
  await campaignQueue.add('dispatch-campaign', { campaignId }, { delay: scheduledAt - Date.now() });
  ```

---

## 7. Matriz de Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Latência de webhooks | Alta | Médio | Implementar SSE ou polling para eventos críticos |
| QR code expira rápido | Alta | Baixo | Polling a cada 5s enquanto conectando |
| Histórico grande | Média | Médio | Paginação + índices otimizados |
| Rate limiting da uazapi | Média | Alto | Respeitar limites, delays, circuit breaker |
| Banimento por envio agressivo | Média | Alto | Warmup obrigatório, delays randomizados, monitoramento |
| Consumo excessivo de créditos | Baixa | Alto | Confirmação antes de campanhas grandes, alertas |
| Inconsistência de dados | Baixa | Alto | Idempotência, deduplicação, eventos internos canônicos |
| Downtime da uazapi | Baixa | Alto | Circuit breaker, fallback para fila, alertas |
| Breaking change da uazapi | Baixa | Médio | Versionamento da OpenAPI, testes de integração |
| Paridade incompleta com Evolution API | Alta | Médio | Tabela de capacidades, graceful degradation |
| Custo de infra self-hosted | Alta | Médio | Avaliar ROI antes de migrar para Evolution API |
| Perda de dados na migração | Baixa | Alto | Backup completo, migração piloto, rollback plan |

---

## 8. Critérios de Aceite / DoD (Definition of Done)

### Fase 1
- ✅ Cliente cria instância via painel Ruptur
- ✅ Cliente conecta instância e vê QR code
- ✅ Cliente vê lista de conversas sincronizadas
- ✅ Cliente envia texto e imagem
- ✅ Mensagens recebidas aparecem em tempo real
- ✅ Créditos deduzidos ao enviar
- ✅ Testes de integração passam
- ✅ Logs de auditoria registram ações
- ✅ Documentação de API atualizada

### Fase 2
- ✅ Cliente cria campanha e importa CSV
- ✅ Campanha dispara com delays
- ✅ Estatísticas de entrega/leitura atualizadas
- ✅ Cliente cria lead e move no pipeline
- ✅ Cliente configura warmup
- ✅ Chatbot responde automaticamente
- ✅ Recuperação de carrinho envia mensagem
- ✅ Cliente gerencia catálogo business
- ✅ Créditos deduzidos corretamente
- ✅ Testes E2E passam
- ✅ Performance aceitável (p95 < 500ms para inbox)

### Fase 3
- ✅ Sistema cria instância em ambos os providers
- ✅ Sistema envia mensagem via ambos
- ✅ Webhooks normalizados corretamente
- ✅ Motores internos agnósticos
- ✅ Frontend não depende de provider
- ✅ Migração piloto bem-sucedida
- ✅ Documentação de migração completa
- ✅ Testes de paridade passam

---

## 9. Backlog Sugerido de Implementação

### Epic 1: Fundação (Fase 1)
1. ✅ Adapter UAZAPI expandido (`modules/provider-adapter/uazapi-adapter.js`) — **JÁ EXISTE**
2. ⚠️ Migration: adicionar `qr_code`, `paircode`, `wa_messages_limits` em `instance_registry`
3. ⚠️ Migration: criar `webhook_configurations`
4. ⚠️ ProviderService: criar, conectar, listar, desconectar, reset, deletar instâncias
5. ⚠️ ProviderController: rotas `/api/instances/*`
6. ⚠️ InboxService: listar conversas, buscar mensagens, enviar texto/mídia
7. ⚠️ InboxController: rotas `/api/inbox/*`
8. ⚠️ WebhookCoreService: receber, persistir, deduplicar, normalizar, processar webhooks
9. ⚠️ WebhookController: rota `POST /api/webhooks/uazapi`
10. ⚠️ Frontend: tela de instâncias (`/admin/instances`)
11. ⚠️ Frontend: tela de inbox (`/inbox`)
12. ⚠️ Frontend: componente de QR code (polling)
13. ⚠️ Testes de integração: criar instância, conectar, enviar mensagem
14. ⚠️ Documentação: API endpoints da Fase 1

### Epic 2: Inbox Completo (Fase 2)
15. ⚠️ Migration: criar `uazapi_quick_replies`, `uazapi_chat_notes`
16. ⚠️ InboxService: etiquetas, notas, arquivar, fixar, silenciar, reações, respostas rápidas
17. ⚠️ InboxController: rotas de etiquetas, notas, ações de chat
18. ⚠️ Frontend: componentes de etiquetas, notas, ações de chat
19. ⚠️ Testes E2E: inbox completo

### Epic 3: CRM/Pipeline (Fase 2)
20. ⚠️ Migration: criar `crm_leads`
21. ⚠️ CRMService: criar/atualizar leads, mover entre etapas
22. ⚠️ CRMController: rotas `/api/crm/*`
23. ⚠️ Frontend: tela de CRM/Leads (`/crm/leads`, `/crm/pipeline`)
24. ⚠️ Testes E2E: CRM completo

### Epic 4: Campanhas (Fase 2)
25. ⚠️ Migration: expandir `campaigns`, criar `campaign_recipients`
26. ⚠️ CampaignService: criar campanha, importar CSV, agendar, disparar, tracking
27. ⚠️ CampaignController: rotas `/api/campaigns/*`
28. ⚠️ Bull queue: `campaign-dispatch`
29. ⚠️ Frontend: tela de Campanhas (`/campaigns`)
30. ⚠️ Testes E2E: campanhas

### Epic 5: Recuperação de Carrinho (Fase 2)
31. ⚠️ Migration: criar `cart_recovery_campaigns`, `cart_recovery_events`
32. ⚠️ CartRecoveryService: escutar abandono, agendar, enviar, tracking
33. ⚠️ CartRecoveryController: rotas `/api/cart-recovery/*`
34. ⚠️ Bull queue: `cart-recovery-trigger`
35. ⚠️ Frontend: tela de Recuperação (`/cart-recovery`)
36. ⚠️ Testes E2E: cart recovery

### Epic 6: Warmup/Anti-ban (Fase 2)
37. ⚠️ Migration: criar `warmup_profiles`
38. ⚠️ WarmupService: aplicar perfil, delays, presença, privacidade, proxy
39. ⚠️ WarmupController: rotas `/api/warmup/*`
40. ⚠️ Bull queue: `warmup-maintenance`
41. ⚠️ Frontend: tela de Warmup (`/admin/warmup`)
42. ⚠️ Testes E2E: warmup

### Epic 7: Grupos (Fase 2)
43. ⚠️ Migration: criar `whatsapp_groups`
44. ⚠️ GroupsService: criar, listar, entrar, sair
45. ⚠️ GroupsController: rotas `/api/groups/*`
46. ⚠️ Frontend: tela de Grupos (`/groups`)
47. ⚠️ Testes E2E: grupos

### Epic 8: Business Profile (Fase 2)
48. ⚠️ Migration: criar `business_profiles`, `business_catalog_items`
49. ⚠️ BusinessService: sincronizar perfil, gerenciar catálogo
50. ⚠️ BusinessController: rotas `/api/business/*`
51. ⚠️ Frontend: tela de Business (`/business`)
52. ⚠️ Testes E2E: business

### Epic 9: Chatbot/IA (Fase 2)
53. ⚠️ Migration: criar `chatbot_configurations`, `chatbot_conversations`
54. ⚠️ ChatbotService: processar mensagens, chamar OpenAI, pausar/retomar
55. ⚠️ ChatbotController: rotas `/api/chatbot/*`
56. ⚠️ Bull queue: `chatbot-response`
57. ⚠️ Frontend: tela de Chatbot (`/admin/chatbot`)
58. ⚠️ Testes E2E: chatbot

### Epic 10: Abstração para Evolution API (Fase 3)
59. ⚠️ Migration: adicionar `provider_accounts.provider_type`, `provider_capabilities`
60. ⚠️ EvolutionApiAdapter: implementar `IProviderAdapter` para Evolution API
61. ⚠️ ProviderFactory: criar adapter correto baseado em `provider_type`
62. ⚠️ EventNormalizer: normalizar eventos de ambos os providers
63. ⚠️ CapabilityChecker: verificar suporte antes de chamar método
64. ⚠️ Testes de paridade: validar funcionalidades em ambos os providers
65. ⚠️ Ferramentas de migração: migrar instâncias de uazapi para Evolution API
66. ⚠️ Frontend: configuração de provider (Admin/Superadmin)
67. ⚠️ Frontend: ferramentas de migração (Admin/Superadmin)
68. ⚠️ Documentação: guia de migração para Evolution API

---

## 10. Conclusão

Este blueprint consolida o caminho completo para eliminar a dependência do Bubble e construir um backend próprio robusto, multi-tenant e escalável para a Ruptur Cloud.

**Próximos passos imediatos**:
1. Revisar este documento com a equipe técnica e produto
2. Validar prioridades e escopo de cada fase
3. Estimar esforço por epic
4. Criar issues/tasks no backlog
5. Iniciar desenvolvimento da Fase 1 (fundação)

**Contato para dúvidas**: consultar `AGENTS.md`, `INTEGRATIONS_AND_WEBHOOK_CORE.md`, `UAZAPI_INTEGRATION_COVERAGE.md` e este blueprint.

---

**Fim do Blueprint**
