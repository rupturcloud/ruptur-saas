/**
 * crm.api.js — Client do CRM/Kanban → gateway /api/crm/*
 *
 *   GET  /api/crm/pipeline?instanceKey= → colunas + cards (chats agrupados por lead_status)
 *   POST /api/crm/card/move             → /chat/editLead (lead_status, lead_kanbanOrder)
 *   POST /api/crm/card/update           → /chat/editLead (tags, atendente, nome, etc.)
 *   GET/POST /api/crm/stages            → CRUD de colunas do funil
 *
 * Auth: mesmo padrão do inbox.api.js (token + tenantId de window.__ruptur.auth).
 */

function auth() {
  const a = window.__ruptur?.auth || {};
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
    credentials: 'include',
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

export const crmApi = {
  /** Colunas + cards do funil para uma instância */
  getPipeline(instanceKey, { limit = 200 } = {}) {
    const qs = new URLSearchParams({ instanceKey, limit: String(limit) });
    return call(`/api/crm/pipeline?${qs.toString()}`);
  },

  /** Move um card para outra coluna (lead_status) e posição */
  moveCard(instanceKey, chatId, leadStatus, kanbanOrder) {
    return call('/api/crm/card/move', {
      method: 'POST',
      body: { instanceKey, chatId, leadStatus, kanbanOrder },
    });
  },

  /** Atualiza dados do lead de um card */
  updateCard(instanceKey, chatId, leadFields = {}) {
    return call('/api/crm/card/update', {
      method: 'POST',
      body: { instanceKey, chatId, ...leadFields },
    });
  },

  /** Colunas do funil (sem cards) */
  listStages() {
    return call('/api/crm/stages');
  },

  createStage(stage) {
    return call('/api/crm/stages', { method: 'POST', body: stage });
  },

  updateStage(stageId, patch) {
    return call('/api/crm/stages/update', { method: 'POST', body: { stageId, ...patch } });
  },

  deleteStage(stageId) {
    return call('/api/crm/stages/delete', { method: 'POST', body: { stageId } });
  },

  reorderStages(order) {
    return call('/api/crm/stages/reorder', { method: 'POST', body: { order } });
  },
};

export default crmApi;
