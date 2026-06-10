/**
 * inbox.api.js — Client do Inbox rico (estilo Chatwoot) → gateway /api/inbox/*
 *
 * Diferente de whatsapp.api.js (que usa /api/v1/whatsapp/*), o inbox rico usa as
 * rotas /api/inbox/* do gateway, que mapeiam direto pra spec UAZAPI com filtros:
 *   POST /api/inbox/chats      → /chat/find   (Mine/Unassigned/All, etiquetas, grupos)
 *   POST /api/inbox/messages   → /message/find
 *   POST /api/inbox/send       → /send/text | /send/media
 *   POST /api/inbox/markread   → /message/markread
 *   POST /api/inbox/lead       → /chat/editLead (atribuição, tags, ticket)
 *   GET  /api/inbox/labels/:k  → /chat/labels
 *   GET  /api/inbox/groups/:k  → /group/list
 *   GET  /api/inbox/instances  → instâncias do tenant
 *   GET  /api/inbox/sse/:k?token= → tempo real (EventSource)
 *
 * Auth: token + tenantId vêm de window.__ruptur.auth (setado pelo AuthContext).
 */

function auth() {
  const a = window.__ruptur?.auth || {};
  // Fallback do tenantId: durante o bootstrap, o efeito do AuthContext que escreve
  // window.__ruptur roda DEPOIS dos filhos — a 1ª busca poderia sair sem tenantId e
  // cair no tenant default. A escolha persistida no localStorage é a fonte síncrona
  // confiável (gravada por switchTenant), então a usamos quando o global ainda não tem.
  let tenantId = a.tenantId;
  if (!tenantId) {
    try { tenantId = window.localStorage.getItem('ruptur_active_tenant') || undefined; } catch { /* noop */ }
  }
  return { token: a.token, tenantId };
}

async function call(path, { method = 'GET', body } = {}) {
  const { token, tenantId } = auth();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include', // paridade com httpClient: envia cookie de sessão como fallback
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erro ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const inboxApi = {
  /** Instâncias WhatsApp do tenant (sidebar) */
  listInstances() {
    return call('/api/inbox/instances');
  },

  /**
   * Busca conversas com filtros.
   * @param {string} instanceKey
   * @param {object} opts { filters, sort, limit, offset }
   *   filters: { wa_isGroup, wa_archived, lead_isTicketOpen, lead_assignedAttendant_id, wa_label, lead_tags }
   */
  findChats(instanceKey, { filters = {}, sort = '-wa_lastMsgTimestamp', limit = 40, offset = 0 } = {}) {
    return call('/api/inbox/chats', {
      method: 'POST',
      body: { instanceKey, filters, sort, limit, offset },
    });
  },

  /** Histórico de mensagens de um chat (paginado) */
  findMessages(instanceKey, chatId, { limit = 50, offset = 0 } = {}) {
    return call('/api/inbox/messages', {
      method: 'POST',
      body: { instanceKey, chatId, limit, offset },
    });
  },

  /** Envia mensagem (texto por padrão) */
  send(instanceKey, to, content, { type = 'text', mediaUrl, caption, filename } = {}) {
    return call('/api/inbox/send', {
      method: 'POST',
      body: { instanceKey, to, type, content, mediaUrl, caption, filename },
    });
  },

  /** Marca mensagens como lidas */
  markRead(instanceKey, messageIds) {
    return call('/api/inbox/markread', {
      method: 'POST',
      body: { instanceKey, messageIds: Array.isArray(messageIds) ? messageIds : [messageIds] },
    });
  },

  /** Reage a uma mensagem */
  react(instanceKey, messageId, emoji) {
    return call('/api/inbox/react', {
      method: 'POST',
      body: { instanceKey, messageId, emoji },
    });
  },

  /** Edita o lead do chat (atribuição, tags, status do ticket, nome, etc.) */
  editLead(instanceKey, chatId, leadFields = {}) {
    return call('/api/inbox/lead', {
      method: 'POST',
      body: { instanceKey, chatId, ...leadFields },
    });
  },

  /** Apaga uma mensagem (para todos) */
  deleteMessage(instanceKey, messageId) {
    return call('/api/inbox/message/delete', {
      method: 'POST',
      body: { instanceKey, messageId },
    });
  },

  /** Edita o texto de uma mensagem já enviada */
  editMessage(instanceKey, messageId, text) {
    return call('/api/inbox/message/edit', {
      method: 'POST',
      body: { instanceKey, messageId, text },
    });
  },

  /** Fixa/desafixa uma mensagem */
  pinMessage(instanceKey, messageId, { pin = true, duration } = {}) {
    return call('/api/inbox/message/pin', {
      method: 'POST',
      body: { instanceKey, messageId, pin, duration },
    });
  },

  /** Baixa a mídia de uma mensagem (opcionalmente transcreve áudio) */
  downloadMessage(instanceKey, messageId, { transcribe = false } = {}) {
    return call('/api/inbox/message/download', {
      method: 'POST',
      body: { instanceKey, messageId, transcribe },
    });
  },

  /** Etiquetas disponíveis na instância */
  getLabels(instanceKey) {
    return call(`/api/inbox/labels/${encodeURIComponent(instanceKey)}`);
  },

  /** Grupos WhatsApp da instância */
  getGroups(instanceKey) {
    return call(`/api/inbox/groups/${encodeURIComponent(instanceKey)}`);
  },

  /** URL do stream SSE (EventSource) — token vai na query (EventSource não suporta header) */
  sseUrl(instanceKey) {
    const { token } = auth();
    return `/api/inbox/sse/${encodeURIComponent(instanceKey)}?token=${encodeURIComponent(token || '')}`;
  },
};

export default inboxApi;
