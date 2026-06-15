/**
 * campaigns.api.js — Client de Campanhas → gateway /api/campaigns/* (proxy warmup-core)
 *
 *   POST /api/campaigns                 → cria campanha (draft)
 *   GET  /api/campaigns                 → lista campanhas do tenant
 *   GET  /api/campaigns/:id             → detalhe
 *   POST /api/campaigns/:id/launch      → lança (modo nativo /sender/advanced quando dispatchMode='native')
 *   POST /api/campaigns/:id/pause       → pausa
 *   POST /api/campaigns/:id/stop        → para
 *   GET  /api/campaigns/:id/stats       → métricas
 *
 * Auth: mesmo padrão (token + tenantId de window.__ruptur.auth).
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

  // tenantId também na query: o proxy warmup valida membership e injeta X-Auth-Tenant-Id
  const sep = path.includes('?') ? '&' : '?';
  const url = tenantId ? `${path}${sep}tenantId=${encodeURIComponent(tenantId)}` : path;

  const res = await fetch(url, {
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

export const campaignsApi = {
  list(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.status) qs.set('status', opts.status);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const q = qs.toString();
    return call(`/api/campaigns${q ? `?${q}` : ''}`);
  },

  get(id) {
    return call(`/api/campaigns/${encodeURIComponent(id)}`);
  },

  /**
   * Cria campanha. Campos aceitos pelo backend (modo híbrido):
   *   { name, message, mediaType, media:[url], buttons:[{text}], footerText,
   *     customNumbers:[...], instanceIds:[...], senderType, dispatchMode:'native',
   *     delayMin, delayMax, scheduleType, scheduledAt }
   */
  create(payload) {
    return call('/api/campaigns', { method: 'POST', body: payload });
  },

  launch(id, body = {}) {
    return call(`/api/campaigns/${encodeURIComponent(id)}/launch`, { method: 'POST', body });
  },

  pause(id, body = {}) {
    return call(`/api/campaigns/${encodeURIComponent(id)}/pause`, { method: 'POST', body });
  },

  stop(id, body = {}) {
    return call(`/api/campaigns/${encodeURIComponent(id)}/stop`, { method: 'POST', body });
  },

  stats(id) {
    return call(`/api/campaigns/${encodeURIComponent(id)}/stats`);
  },
};

export default campaignsApi;
