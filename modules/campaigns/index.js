/**
 * Campaigns Module — Campanhas de disparo em massa
 *
 * Fonte de verdade: Supabase (tabelas `campaigns` + `campaign_recipients`).
 * Envio via UAZAPI. Débito de créditos via WalletManager.
 *
 * NOTA DE ARQUITETURA:
 * - Persistência migrada de Bubble → Supabase (débito técnico ITEM A1).
 * - O objeto "de domínio" exposto a quem consome (warmup-core, front) usa
 *   camelCase e um sub-objeto `metrics`. As linhas do banco usam snake_case.
 *   O mapeamento bidirecional fica em rowToCampaign()/buildDbPayload().
 * - Status de domínio ↔ banco: 'active' ↔ 'sending', 'stopped' ↔ 'cancelled'.
 *   Os demais são idênticos (draft, scheduled, paused, completed, failed).
 * - A fila de envio (`sendingQueue`) ainda é in-memory (ITEM A3 — Bull/Redis
 *   é follow-up). O PROGRESSO, porém, é persistido em campaign_recipients e
 *   em campaigns.sent_count, então um restart não perde dados de campanha.
 * - Contatos por `listId`/`segment` dependem do módulo CRM (ITEM A2, ainda
 *   não implementado). Por ora só `custom` (números diretos) e CSV populam
 *   campaign_recipients; list/segment logam aviso explícito.
 */

import UaZAPIClient from '../../integrations/uazapi/client.js';
import { inboxManager } from '../inbox/index.js';
import { getWalletManager } from '../wallet/index.js';

const uazapiClient = new UaZAPIClient();

// ---------------------------------------------------------------------------
//  Mapeamento de status domínio ↔ banco
// ---------------------------------------------------------------------------
const STATUS_TO_DB = {
  draft: 'draft',
  scheduled: 'scheduled',
  active: 'sending',
  running: 'sending',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  stopped: 'cancelled',
  cancelled: 'cancelled',
};
const STATUS_TO_DOMAIN = {
  draft: 'draft',
  scheduled: 'scheduled',
  sending: 'active',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'stopped',
};
const toDbStatus = (s) => STATUS_TO_DB[s] || 'draft';
const toDomainStatus = (s) => STATUS_TO_DOMAIN[s] || s || 'draft';

export class CampaignManager {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) {
      throw new Error('[Campaigns] CampaignManager requer um client Supabase injetado.');
    }
    this.supabase = supabase;

    // Caches de execução (a fonte de verdade é o Supabase).
    this.campaigns = new Map();       // id -> campanha de domínio (cache leve)
    this.activeCampaigns = new Map(); // id -> campanha em envio
    this.sendingQueue = [];           // fila in-memory de envio (ITEM A3: Bull)
    this.isProcessing = false;
  }

  // =========================================================================
  //  Mapeamento de linha (DB) -> objeto de domínio
  // =========================================================================
  rowToCampaign(row) {
    if (!row) return null;
    const meta = row.metadata || {};
    const campaign = {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: meta.description || '',
      type: meta.type || 'broadcast',
      status: toDomainStatus(row.status),
      settings: meta.settings || {
        delayBetweenMessages: 5000,
        maxRetries: 3,
        scheduleType: row.scheduled_at ? 'scheduled' : 'immediate',
        scheduledAt: row.scheduled_at,
        timezone: 'America/Sao_Paulo',
      },
      content: {
        message: row.message_template,
        media: row.media_url ? [row.media_url] : [],
        mediaType: row.media_type || 'text',
        variables: meta.variables || [],
      },
      recipients: meta.recipients || { type: 'custom', customNumbers: [] },
      sender: meta.sender || { type: 'pool', instanceIds: [], maxMessagesPerInstance: 50 },
      metrics: {
        totalRecipients: row.total_recipients || 0,
        sentCount: row.sent_count || 0,
        deliveredCount: row.delivered_count || 0,
        readCount: row.read_count || 0,
        failedCount: row.failed_count || 0,
        replyCount: meta.replyCount || 0,
      },
      instanceId: row.instance_id || null,
      scheduledAt: row.scheduled_at,
      launchedAt: row.started_at,
      completedAt: row.completed_at,
      createdBy: meta.createdBy || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  /**
   * Monta o payload snake_case para insert/update em `campaigns`.
   * Campos sem coluna dedicada vão para metadata JSONB.
   */
  buildDbPayload(campaign) {
    return {
      tenant_id: campaign.tenantId,
      name: campaign.name,
      message_template: campaign.content?.message || '',
      media_url: campaign.content?.media?.[0] || null,
      media_type: ['image', 'video', 'audio', 'document'].includes(campaign.content?.mediaType)
        ? campaign.content.mediaType
        : null,
      status: toDbStatus(campaign.status),
      total_recipients: campaign.metrics?.totalRecipients || 0,
      sent_count: campaign.metrics?.sentCount || 0,
      delivered_count: campaign.metrics?.deliveredCount || 0,
      read_count: campaign.metrics?.readCount || 0,
      failed_count: campaign.metrics?.failedCount || 0,
      scheduled_at: campaign.settings?.scheduledAt || null,
      instance_id: campaign.instanceId || null,
      metadata: {
        description: campaign.description,
        type: campaign.type,
        settings: campaign.settings,
        sender: campaign.sender,
        recipients: campaign.recipients,
        variables: campaign.content?.variables || [],
        createdBy: campaign.createdBy,
        replyCount: campaign.metrics?.replyCount || 0,
      },
    };
  }

  // =========================================================================
  //  CRUD
  // =========================================================================
  async createCampaign(campaignData) {
    const domain = {
      tenantId: campaignData.tenantId,
      name: campaignData.name,
      description: campaignData.description,
      type: campaignData.type || 'broadcast',
      status: 'draft',
      settings: {
        delayBetweenMessages: campaignData.delayBetweenMessages || 5000,
        maxRetries: campaignData.maxRetries || 3,
        scheduleType: campaignData.scheduleType || 'immediate',
        scheduledAt: campaignData.scheduledAt || null,
        timezone: campaignData.timezone || 'America/Sao_Paulo',
      },
      content: {
        message: campaignData.message,
        media: campaignData.media || [],
        mediaType: campaignData.mediaType || 'text',
        variables: campaignData.variables || [],
      },
      recipients: {
        type: campaignData.recipientType || 'custom',
        listId: campaignData.listId,
        segmentId: campaignData.segmentId,
        customNumbers: campaignData.customNumbers || [],
      },
      sender: {
        type: campaignData.senderType || 'pool',
        instanceIds: campaignData.instanceIds || [],
        maxMessagesPerInstance: campaignData.maxMessagesPerInstance || 50,
      },
      instanceId: campaignData.instanceId || null,
      createdBy: campaignData.createdBy,
      metrics: { totalRecipients: 0, sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0, replyCount: 0 },
    };

    const { data, error } = await this.supabase
      .from('campaigns')
      .insert(this.buildDbPayload(domain))
      .select()
      .single();

    if (error) {
      console.error('[Campaigns] Erro ao criar campanha:', error.message);
      throw new Error(`Erro ao criar campanha: ${error.message}`);
    }

    const campaign = this.rowToCampaign(data);

    // Persiste destinatários diretos (custom) já na criação.
    const initialRecipients = this._extractInlineRecipients(campaignData);
    if (initialRecipients.length > 0) {
      await this._insertRecipients(campaign.id, initialRecipients);
      await this.supabase
        .from('campaigns')
        .update({ total_recipients: initialRecipients.length })
        .eq('id', campaign.id);
      campaign.metrics.totalRecipients = initialRecipients.length;
    }

    console.log(`[Campaigns] Campanha criada: ${campaign.id} - ${campaign.name}`);
    return campaign;
  }

  /** Extrai destinatários embutidos no payload (custom numbers ou lista explícita). */
  _extractInlineRecipients(campaignData) {
    const out = [];
    const custom = campaignData.customNumbers || [];
    for (const n of custom) {
      if (typeof n === 'string') out.push({ phone: n, name: n });
      else if (n && n.phone) out.push({ phone: n.phone, name: n.name || n.phone });
    }
    // Aceita também recipients explícitos [{phone,name}, ...]
    for (const r of campaignData.recipients?.list || campaignData.recipientList || []) {
      if (r && r.phone) out.push({ phone: r.phone, name: r.name || r.phone });
    }
    return out.filter((r) => this.isValidPhoneNumber(r.phone));
  }

  async _insertRecipients(campaignId, recipients) {
    const rows = recipients.map((r) => ({
      campaign_id: campaignId,
      phone: String(r.phone).replace(/\D/g, ''),
      name: r.name || null,
      status: 'pending',
    }));
    // Insere em lotes de 500 para não estourar limites
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await this.supabase.from('campaign_recipients').insert(chunk);
      if (error) console.error('[Campaigns] Erro ao inserir destinatários:', error.message);
    }
  }

  async getCampaign(campaignId) {
    const { data, error } = await this.supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (error) {
      console.error('[Campaigns] Erro ao buscar campanha:', error.message);
      return null;
    }
    return this.rowToCampaign(data);
  }

  async getAllCampaigns(options = {}) {
    const { status, tenantId, limit = 50, offset = 0 } = options;
    let query = this.supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (status) query = query.eq('status', toDbStatus(status));

    const { data, error, count } = await query;
    if (error) {
      console.error('[Campaigns] Erro ao listar campanhas:', error.message);
      return { campaigns: [], total: 0 };
    }
    const campaigns = (data || []).map((row) => this.rowToCampaign(row));
    return { campaigns, total: count ?? campaigns.length };
  }

  // =========================================================================
  //  Lifecycle
  // =========================================================================
  async launchCampaign(campaignId) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new Error(`Campaign ${campaignId} não está em status lançável (atual: ${campaign.status})`);
    }

    const recipients = await this.getRecipients(campaign);
    if (recipients.length === 0) {
      throw new Error('Nenhum destinatário encontrado para a campanha');
    }

    const walletManager = getWalletManager();
    const hasCredits = await walletManager.hasEnoughCredits(campaign.tenantId, 1);
    if (!hasCredits) {
      throw new Error(`Créditos insuficientes para o tenant ${campaign.tenantId} lançar a campanha`);
    }

    campaign.metrics.totalRecipients = recipients.length;
    campaign.status = 'active';
    campaign.launchedAt = new Date().toISOString();

    const { error } = await this.supabase
      .from('campaigns')
      .update({ status: 'sending', started_at: campaign.launchedAt, total_recipients: recipients.length })
      .eq('id', campaignId);
    if (error) throw new Error(`Erro ao lançar campanha: ${error.message}`);

    this.activeCampaigns.set(campaignId, campaign);
    this.campaigns.set(campaignId, campaign);

    if (campaign.settings.scheduleType === 'immediate') {
      await this.startSending(campaignId, recipients);
    } else {
      this.scheduleCampaign(campaignId, recipients);
    }

    console.log(`[Campaigns] Campanha lançada: ${campaignId} com ${recipients.length} destinatários`);
    return true;
  }

  async getRecipients(campaign) {
    // Fonte primária: destinatários já persistidos em campaign_recipients.
    const { data, error } = await this.supabase
      .from('campaign_recipients')
      .select('id, phone, name, status')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending');

    if (error) {
      console.error('[Campaigns] Erro ao buscar destinatários:', error.message);
      return [];
    }

    let recipients = (data || []).map((r) => ({ recipientId: r.id, phone: r.phone, name: r.name || r.phone }));

    // list/segment dependem do CRM (ITEM A2). Sem ele, avisa em vez de quebrar.
    if (recipients.length === 0 && campaign.recipients?.type && campaign.recipients.type !== 'custom') {
      console.warn(
        `[Campaigns] recipients.type='${campaign.recipients.type}' requer módulo CRM (ITEM A2) ` +
        `ainda não implementado. Use customNumbers/CSV por enquanto.`
      );
    }

    return recipients.filter((c) => c.phone && this.isValidPhoneNumber(c.phone));
  }

  async startSending(campaignId, recipients) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) return;

    const senderInstances = await this.getSenderInstances(campaign);
    if (senderInstances.length === 0) {
      throw new Error('Nenhuma instância de envio disponível');
    }

    console.log(`[Campaigns] Iniciando envio da campanha ${campaignId} para ${recipients.length} destinatários`);

    for (const recipient of recipients) {
      this.sendingQueue.push({ campaignId, recipient, campaign, senderInstances, retryCount: 0 });
    }

    if (!this.isProcessing) this.processSendingQueue();
  }

  async processSendingQueue() {
    if (this.isProcessing || this.sendingQueue.length === 0) return;
    this.isProcessing = true;

    while (this.sendingQueue.length > 0) {
      const item = this.sendingQueue.shift();
      const campaign = this.activeCampaigns.get(item.campaignId) || item.campaign;

      if (!campaign || campaign.status === 'stopped' || campaign.status === 'cancelled') continue;
      if (campaign.status === 'paused') { this.sendingQueue.unshift(item); break; }
      if (campaign.status !== 'active' && campaign.status !== 'running') continue;

      try {
        await this.sendCampaignMessage(item);
      } catch (error) {
        console.error('[Campaigns] Erro ao enviar mensagem:', error.message);
        const liveStatus = this.activeCampaigns.get(item.campaignId)?.status || item.campaign.status;
        if (liveStatus === 'active' && item.retryCount < item.campaign.settings.maxRetries) {
          item.retryCount++;
          this.sendingQueue.push(item);
          await this.delay(5000, item.campaignId);
        } else {
          item.campaign.metrics.failedCount++;
          await this._markRecipient(item.recipient.recipientId, 'failed', error.message);
          await this.updateCampaignMetrics(item.campaignId);
        }
      }

      if (this.sendingQueue.length > 0) {
        await this.delay(item.campaign.settings.delayBetweenMessages, item.campaignId);
      }
    }

    this.isProcessing = false;

    // Se não há mais nada pendente para esta(s) campanha(s), marca como concluída.
    await this._finalizeDrainedCampaigns();

    if (this.sendingQueue.some((item) => {
      const c = this.activeCampaigns.get(item.campaignId);
      return c?.status === 'active' || c?.status === 'running';
    })) {
      this.processSendingQueue();
    }
  }

  async _finalizeDrainedCampaigns() {
    for (const [id, campaign] of this.activeCampaigns.entries()) {
      const stillQueued = this.sendingQueue.some((i) => i.campaignId === id);
      if (!stillQueued && campaign.status === 'active') {
        campaign.status = 'completed';
        await this.supabase
          .from('campaigns')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', id);
        this.activeCampaigns.delete(id);
        console.log(`[Campaigns] Campanha concluída: ${id}`);
      }
    }
  }

  async sendCampaignMessage(item) {
    const { campaign, recipient, senderInstances } = item;

    const liveCampaign = this.activeCampaigns.get(campaign.id);
    if (!liveCampaign || liveCampaign.status !== 'active') {
      throw new Error(`Campanha ${campaign.id} não está ativa`);
    }

    const senderInstance = senderInstances[campaign.metrics.sentCount % senderInstances.length];

    const messageText = this.personalizeMessage(
      campaign.content.message,
      recipient,
      campaign.content.variables || []
    );

    const mediaType = recipient.mediaType || campaign.content.mediaType || 'text';
    const mediaUrl = recipient.mediaUrl || (campaign.content.media && campaign.content.media[0]);

    // 1. Débito de crédito ANTES do envio.
    try {
      const liveBeforeDebit = this.activeCampaigns.get(campaign.id);
      if (!liveBeforeDebit || liveBeforeDebit.status !== 'active') {
        throw new Error(`Campanha ${campaign.id} foi pausada/parada antes do débito`);
      }
      const walletManager = getWalletManager();
      await walletManager.deductCredit(campaign.tenantId, 1, {
        campaignId: campaign.id,
        description: `Campaign message to ${recipient.phone}`,
      });
    } catch (walletError) {
      console.error('[Campaigns] Mensagem bloqueada por falha de crédito:', walletError.message);
      throw new Error(`Credit deduction failed: ${walletError.message}`);
    }

    // 2. Envio conforme tipo.
    let result;
    const liveBeforeSend = this.activeCampaigns.get(campaign.id);
    if (!liveBeforeSend || liveBeforeSend.status !== 'active') {
      throw new Error(`Campanha ${campaign.id} foi pausada/parada antes do envio`);
    }

    if (mediaType !== 'text') {
      result = await uazapiClient.sendMedia(senderInstance.token || senderInstance.id, {
        number: recipient.phone,
        type: mediaType,
        file: mediaUrl,
        text: messageText,
        viewOnce: mediaType === 'image' || mediaType === 'video' || mediaType === 'ptv',
        replyid: recipient.replyTo,
      });
    } else if (recipient.menuType && (recipient.buttons || recipient.sections)) {
      result = await uazapiClient.sendMenu(senderInstance.token || senderInstance.id, {
        number: recipient.phone,
        type: recipient.menuType,
        text: messageText,
        buttons: recipient.buttons,
        sections: recipient.sections,
        footerText: recipient.footerText,
        replyid: recipient.replyTo,
      });
    } else if (recipient.latitude && recipient.longitude) {
      result = await uazapiClient.sendLocationButton(senderInstance.token || senderInstance.id, {
        number: recipient.phone,
        latitude: recipient.latitude,
        longitude: recipient.longitude,
        name: recipient.locationName || '',
        address: recipient.address || '',
        replyid: recipient.replyTo,
      });
    } else {
      result = await uazapiClient.sendText(senderInstance.token || senderInstance.id, {
        number: recipient.phone,
        text: messageText,
        replyid: recipient.replyTo,
        linkPreview: true,
      });
    }

    const liveAfterSend = this.activeCampaigns.get(campaign.id);
    if (!liveAfterSend || liveAfterSend.status !== 'active') return;

    campaign.metrics.sentCount++;
    await this._markRecipient(recipient.recipientId, 'sent', null, result?.id || result?.messageId);
    await this.updateCampaignMetrics(campaign.id);

    console.log(`[Campaigns] Mensagem enviada para ${recipient.phone} via ${senderInstance.id} (tipo: ${mediaType})`);
  }

  /** Atualiza o status de um destinatário em campaign_recipients. */
  async _markRecipient(recipientId, status, errorMessage = null, messageId = null) {
    if (!recipientId) return;
    const patch = { status };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    if (errorMessage) patch.error_message = String(errorMessage).slice(0, 500);
    const { error } = await this.supabase.from('campaign_recipients').update(patch).eq('id', recipientId);
    if (error) console.error('[Campaigns] Erro ao atualizar destinatário:', error.message);
  }

  personalizeMessage(template, recipient, variables) {
    let message = template || '';
    message = message.replace(/\{name\}/g, recipient.name || '');
    message = message.replace(/\{phone\}/g, recipient.phone || '');
    message = message.replace(/\{email\}/g, recipient.email || '');

    for (const variable of variables) {
      const value = recipient.variables?.[variable.name] || variable.defaultValue || '';
      message = message.replace(new RegExp(`\\{${variable.name}\\}`, 'g'), value);
    }

    // Spintext: {opt1|opt2|opt3}
    message = message.replace(/\{([^{}]*)\}/g, (match, options) => {
      if (!options) return match;
      const choices = options.split('|').map((s) => s.trim()).filter(Boolean);
      if (choices.length === 0) return match;
      return choices[Math.floor(Math.random() * choices.length)];
    });

    return message;
  }

  async getSenderInstances(campaign) {
    try {
      if (campaign.sender.type === 'specific') {
        const instances = [];
        for (const instanceId of campaign.sender.instanceIds) {
          const instance = await uazapiClient.getInstance(instanceId);
          if (instance && instance.connected) instances.push(instance);
        }
        return instances;
      }
      const inboxSummary = await inboxManager.getInboxSummary(campaign.tenantId);
      return (inboxSummary.instances || []).filter((i) => i.connected).slice(0, 10);
    } catch (error) {
      console.error('[Campaigns] Erro ao obter instâncias de envio:', error.message);
      return [];
    }
  }

  /** Processa CSV e persiste destinatários numa campanha existente. */
  async addRecipientsFromCsv(campaignId, fileBuffer) {
    const contacts = this.parseCsv(fileBuffer);
    if (contacts.length > 0) {
      await this._insertRecipients(campaignId, contacts);
      const { count } = await this.supabase
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);
      await this.supabase.from('campaigns').update({ total_recipients: count || contacts.length }).eq('id', campaignId);
    }
    return contacts.length;
  }

  parseCsv(fileBuffer) {
    try {
      const csvContent = fileBuffer.toString('utf8');
      const lines = csvContent.trim().split('\n');
      if (lines.length === 0) return [];
      const headers = lines[0].split(',').map((h) => h.trim());
      const contacts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const contact = {};
        headers.forEach((header, index) => { contact[header] = values[index] || ''; });
        const phoneFields = ['phone', 'number', 'telefone', 'celular', 'whatsapp'];
        let phoneNumber = '';
        for (const field of phoneFields) {
          if (contact[field]) { phoneNumber = contact[field]; break; }
        }
        if (phoneNumber && this.isValidPhoneNumber(phoneNumber)) {
          contacts.push({ phone: phoneNumber, name: contact.name || contact.Nome || contact.nome || phoneNumber });
        }
      }
      console.log(`[Campaigns] CSV processado: ${contacts.length} contatos válidos`);
      return contacts;
    } catch (error) {
      console.error('[Campaigns] Erro ao processar CSV:', error.message);
      return [];
    }
  }

  async updateCampaignMetrics(campaignId) {
    const campaign = this.campaigns.get(campaignId) || this.activeCampaigns.get(campaignId);
    if (!campaign) return;
    const { error } = await this.supabase
      .from('campaigns')
      .update({
        sent_count: campaign.metrics.sentCount,
        delivered_count: campaign.metrics.deliveredCount,
        read_count: campaign.metrics.readCount,
        failed_count: campaign.metrics.failedCount,
      })
      .eq('id', campaignId);
    if (error) console.error('[Campaigns] Erro ao atualizar métricas:', error.message);
  }

  async getCampaignStats(campaignId) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) return null;
    const m = campaign.metrics;
    return {
      ...m,
      deliveryRate: m.totalRecipients > 0 ? (m.deliveredCount / m.totalRecipients) * 100 : 0,
      readRate: m.sentCount > 0 ? (m.readCount / m.sentCount) * 100 : 0,
      replyRate: m.deliveredCount > 0 ? (m.replyCount / m.deliveredCount) * 100 : 0,
    };
  }

  async updateCampaignStatus(campaignId, status) {
    const campaign = (await this.getCampaign(campaignId));
    if (!campaign) return false;
    campaign.status = status;
    this.campaigns.set(campaignId, campaign);

    const patch = { status: toDbStatus(status) };
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    const { error } = await this.supabase.from('campaigns').update(patch).eq('id', campaignId);
    if (error) {
      console.error(`[Campaigns] Erro ao atualizar status de ${campaignId}:`, error.message);
      return false;
    }
    return true;
  }

  async pauseCampaign(campaignId) {
    const ok = await this.updateCampaignStatus(campaignId, 'paused');
    const live = this.activeCampaigns.get(campaignId);
    if (live) live.status = 'paused';
    return ok;
  }

  async stopCampaign(campaignId) {
    const ok = await this.updateCampaignStatus(campaignId, 'stopped');
    this.activeCampaigns.delete(campaignId);
    this.sendingQueue = this.sendingQueue.filter((item) => item.campaignId !== campaignId);
    return ok;
  }

  async getCampaignMessages(campaignId, options = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const { data, error, count } = await this.supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error('[Campaigns] Erro ao buscar mensagens da campanha:', error.message);
      return { messages: [], total: 0 };
    }
    return { messages: data || [], total: count ?? (data || []).length };
  }

  async testCampaign(campaignId, testNumbers) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    const results = [];
    for (const number of testNumbers) {
      try {
        const result = await inboxManager.sendMessage(
          campaign.sender.instanceIds[0],
          number,
          campaign.content.message,
          campaign.content.media.length > 0 ? 'media' : 'text'
        );
        results.push({ number, success: true, messageId: result.messageId });
      } catch (error) {
        results.push({ number, success: false, error: error.message });
      }
    }
    return results;
  }

  async duplicateCampaign(campaignId, name) {
    const original = await this.getCampaign(campaignId);
    if (!original) throw new Error('Original campaign not found');
    return this.createCampaign({
      tenantId: original.tenantId,
      name: name || `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      message: original.content.message,
      media: original.content.media,
      mediaType: original.content.mediaType,
      variables: original.content.variables,
      delayBetweenMessages: original.settings.delayBetweenMessages,
      maxRetries: original.settings.maxRetries,
      scheduleType: original.settings.scheduleType,
      timezone: original.settings.timezone,
      recipientType: original.recipients.type,
      senderType: original.sender.type,
      instanceIds: original.sender.instanceIds,
      createdBy: original.createdBy,
    });
  }

  // -------------------------------------------------------------------------
  //  Utilidades
  // -------------------------------------------------------------------------
  isValidPhoneNumber(phone) {
    if (!phone) return false;
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(String(phone).replace(/\D/g, ''));
  }

  async delay(ms, campaignId) {
    const step = 250;
    let elapsed = 0;
    while (elapsed < ms) {
      const campaign = campaignId ? this.activeCampaigns.get(campaignId) : null;
      if (campaignId && (!campaign || campaign.status !== 'active')) return;
      await new Promise((resolve) => setTimeout(resolve, Math.min(step, ms - elapsed)));
      elapsed += step;
    }
  }

  scheduleCampaign(campaignId) {
    // Campanhas agendadas: o disparo efetivo fica a cargo de um worker (ITEM A3).
    console.log(`[Campaigns] Campanha ${campaignId} agendada`);
  }
}

// ---------------------------------------------------------------------------
//  Singleton — inicializado no warmup-core com supabase injetado.
// ---------------------------------------------------------------------------
let _instance = null;

export function createCampaignManager(supabase) {
  _instance = new CampaignManager(supabase);
  return _instance;
}

export function getCampaignManager() {
  if (!_instance) {
    throw new Error('[Campaigns] Manager não inicializado. Chame createCampaignManager(supabase) primeiro.');
  }
  return _instance;
}

export default CampaignManager;
