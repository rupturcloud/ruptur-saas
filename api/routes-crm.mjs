/**
 * routes-crm.mjs — CRM / Pipeline / Kanban
 *
 * Arquitetura:
 *   Frontend → Gateway (auth + tenant) → { Supabase (colunas do funil) + UAZAPI (cards) }
 *
 * Colunas do funil: crm_stages (Supabase, migration 026), geridas pelo CrmManager.
 * Cards: chats da UAZAPI (/chat/find), agrupados por lead_status. Mover/editar um
 * card = /chat/editLead (lead_status, lead_kanbanOrder, lead_tags, atendente, etc.).
 *
 * O token da instância nunca é exposto ao frontend — reusa getAdapterForInstance
 * (mesmo isolamento por tenant do Inbox).
 */

import { getAdapterForInstance } from './routes-inbox.mjs';
import { createCrmManager, getCrmManager } from '../modules/crm/index.js';

function crm(supabase) {
  return getCrmManager() || createCrmManager(supabase);
}

// Normaliza um chat da UAZAPI em um card de Kanban (defensivo quanto a nomes de campo).
function toCard(chat) {
  return {
    chatId: chat.wa_chatid || chat.id || chat.wa_fastid,
    name: chat.lead_name || chat.wa_name || chat.wa_contactName || chat.name || chat.wa_chatid || 'Sem nome',
    phone: (chat.wa_chatid || '').split('@')[0] || chat.lead_phone || '',
    avatar: chat.image || chat.imagePreview || chat.wa_profilePicUrl || null,
    leadStatus: chat.lead_status || '',
    kanbanOrder: chat.lead_kanbanOrder ?? 0,
    tags: chat.lead_tags || [],
    assignedAttendantId: chat.lead_assignedAttendant_id || null,
    ticketOpen: chat.lead_isTicketOpen ?? null,
    lastMessage: chat.wa_lastMessageText || chat.lastMessage || '',
    lastMessageAt: chat.wa_lastMsgTimestamp || chat.messageTimestamp || null,
    email: chat.lead_email || null,
    notes: chat.lead_notes || null,
  };
}

// ─── GET /api/crm/pipeline?instanceKey= ─────────────────────────────────────────
/**
 * Retorna as colunas do funil + os cards agrupados por coluna.
 * Cria o funil padrão no 1º acesso do tenant.
 */
export async function handleGetPipeline(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const instanceKey = url.searchParams.get('instanceKey');
  if (!instanceKey) return json(res, 400, { error: 'instanceKey obrigatório' }, req);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit')) || 200, 1), 500);

  try {
    const { pipeline, stages } = await crm(supabase).ensurePipeline(tenantId, instanceKey === 'all' ? null : instanceKey);

    // Agrupar por lead_status → coluna. Status desconhecido cai na 1ª coluna.
    const statusToStage = new Map(stages.map((s) => [s.lead_status, s.id]));
    const firstStageId = stages[0]?.id;
    const columns = stages.map((s) => ({ ...s, cards: [] }));
    const byId = new Map(columns.map((c) => [c.id, c]));

    let chats = [];

    // Buscar chats (cards) da UAZAPI. Só conversas individuais (sem grupos).
    if (instanceKey === 'all') {
      const { data: instances } = await supabase
        .from('uazapi_accounts')
        .select('key')
        .eq('tenant_id', tenantId)
        .eq('status', 'connected');

      const promises = (instances || []).map(async (inst) => {
        try {
          const { adapter, resolved } = await getAdapterForInstance(supabase, tenantId, inst.key);
          const result = await adapter.findChats(resolved.token, { operator: 'AND', sort: 'lead_kanbanOrder', limit, offset: 0, wa_isGroup: false });
          const instChats = result.chats || result || [];
          return instChats.map(c => ({ ...c, _sourceInstance: inst.key }));
        } catch (e) {
          return [];
        }
      });
      const results = await Promise.all(promises);
      chats = results.flat();
    } else {
      const { adapter, resolved } = await getAdapterForInstance(supabase, tenantId, instanceKey);
      const result = await adapter.findChats(resolved.token, {
        operator: 'AND',
        sort: 'lead_kanbanOrder',
        limit,
        offset: 0,
        wa_isGroup: false,
      });
      chats = result.chats || result || [];
      chats = chats.map(c => ({ ...c, _sourceInstance: instanceKey }));
    }

    for (const chat of chats) {
      const card = toCard(chat);
      card._sourceInstance = chat._sourceInstance; // repassar instância para a UI
      const stageId = statusToStage.get(card.leadStatus) || firstStageId;
      byId.get(stageId)?.cards.push(card);
    }
    // Ordenar cada coluna por kanbanOrder
    for (const c of columns) c.cards.sort((a, b) => (a.kanbanOrder || 0) - (b.kanbanOrder || 0));

    return json(res, 200, { pipeline, columns, instanceKey }, req);
  } catch (e) {
    return json(res, e.message?.includes('não encontrada') ? 404 : 500, { error: e.message }, req);
  }
}

// ─── POST /api/crm/card/move ────────────────────────────────────────────────────
/**
 * Move um card para outra coluna (lead_status) e/ou posição (lead_kanbanOrder).
 * Body: { instanceKey, chatId, leadStatus, kanbanOrder? }
 */
export async function handleMoveCard(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);

  const { instanceKey, chatId, leadStatus, kanbanOrder } = req.body || {};
  if (!instanceKey || !chatId || !leadStatus) {
    return json(res, 400, { error: 'instanceKey, chatId e leadStatus obrigatórios' }, req);
  }
  try {
    const { adapter, resolved } = await getAdapterForInstance(supabase, tenantId, instanceKey);
    const body = { id: chatId, lead_status: leadStatus };
    if (kanbanOrder !== undefined) body.lead_kanbanOrder = kanbanOrder;
    const result = await adapter.instanceRequest(resolved.token, '/chat/editLead', { method: 'POST', body }, 'Falha ao mover card');
    return json(res, 200, { moved: true, result }, req);
  } catch (e) {
    return json(res, 500, { error: e.message }, req);
  }
}

// ─── POST /api/crm/card/update ──────────────────────────────────────────────────
/**
 * Atualiza dados do lead de um card (tags, atendente, nome, email, notas).
 * Body: { instanceKey, chatId, ...leadFields }
 */
export async function handleUpdateCard(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);

  const { instanceKey, chatId, ...leadFields } = req.body || {};
  if (!instanceKey || !chatId) return json(res, 400, { error: 'instanceKey e chatId obrigatórios' }, req);
  try {
    const { adapter, resolved } = await getAdapterForInstance(supabase, tenantId, instanceKey);
    const result = await adapter.instanceRequest(resolved.token, '/chat/editLead', {
      method: 'POST',
      body: { id: chatId, ...leadFields },
    }, 'Falha ao atualizar card');
    return json(res, 200, { updated: true, result }, req);
  } catch (e) {
    return json(res, 500, { error: e.message }, req);
  }
}

// ─── Stages CRUD (colunas do funil) ─────────────────────────────────────────────

export async function handleListStages(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);
  try {
    const { pipeline, stages } = await crm(supabase).ensurePipeline(tenantId);
    return json(res, 200, { pipeline, stages }, req);
  } catch (e) {
    return json(res, 500, { error: e.message }, req);
  }
}

export async function handleCreateStage(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);
  try {
    const { pipeline } = await crm(supabase).ensurePipeline(tenantId);
    const stage = await crm(supabase).createStage(tenantId, pipeline.id, req.body || {});
    return json(res, 200, { stage }, req);
  } catch (e) {
    return json(res, 400, { error: e.message }, req);
  }
}

export async function handleUpdateStage(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);
  const { stageId, ...patch } = req.body || {};
  if (!stageId) return json(res, 400, { error: 'stageId obrigatório' }, req);
  try {
    const stage = await crm(supabase).updateStage(tenantId, stageId, patch);
    return json(res, 200, { stage }, req);
  } catch (e) {
    return json(res, 400, { error: e.message }, req);
  }
}

export async function handleDeleteStage(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);
  const { stageId } = req.body || {};
  if (!stageId) return json(res, 400, { error: 'stageId obrigatório' }, req);
  try {
    await crm(supabase).deleteStage(tenantId, stageId);
    return json(res, 200, { deleted: true }, req);
  } catch (e) {
    return json(res, 400, { error: e.message }, req);
  }
}

export async function handleReorderStages(req, res, json, supabase) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return json(res, 403, { error: 'Tenant não identificado' }, req);
  const { order } = req.body || {};
  if (!Array.isArray(order)) return json(res, 400, { error: 'order[] obrigatório' }, req);
  try {
    await crm(supabase).reorderStages(tenantId, order);
    return json(res, 200, { reordered: true }, req);
  } catch (e) {
    return json(res, 400, { error: e.message }, req);
  }
}
