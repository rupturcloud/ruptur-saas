import { IProviderAdapter, ProviderAdapterError } from './types.js';

export class UazapiAdapter extends IProviderAdapter {
  constructor(credentials) {
    super(credentials);
    // credentials = { adminToken, serverUrl }
    this.serverUrl = credentials.serverUrl || 'https://tiatendeai.uazapi.com';
    this.adminToken = credentials.adminToken;
    this.instanceToken = credentials.instanceToken;
  }

  async fetchJson(url, init = {}, fallbackMessage = 'Request failed') {
    const response = await fetch(url, init);
    if (!response.ok) {
      let message = `${fallbackMessage}: ${response.status}`;
      try {
        const payload = await response.json();
        if (typeof payload?.error === 'string') message = payload.error;
        else if (typeof payload?.message === 'string') message = payload.message;
      } catch {}
      throw new ProviderAdapterError(message, 'UAZAPI_ERROR');
    }

    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true, raw: text };
    }
  }

  async adminRequest(path, { method = 'GET', body, headers = {} } = {}, fallbackMessage) {
    if (!this.adminToken) {
      throw new ProviderAdapterError('Admin token required', 'MISSING_CREDENTIALS');
    }

    return this.fetchJson(
      `${this.serverUrl}${path}`,
      {
        method,
        headers: {
          admintoken: this.adminToken,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      fallbackMessage
    );
  }

  async instanceRequest(instanceId, path, { method = 'GET', body, headers = {} } = {}, fallbackMessage) {
    if (!instanceId) {
      throw new ProviderAdapterError('Instance token required', 'MISSING_CREDENTIALS');
    }

    return this.fetchJson(
      `${this.serverUrl}${path}`,
      {
        method,
        headers: {
          token: instanceId,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      fallbackMessage
    );
  }

  async listInstances() {
    if (!this.adminToken) {
      throw new ProviderAdapterError('Admin token required', 'MISSING_CREDENTIALS');
    }

    const instances = await this.fetchJson(
      `${this.serverUrl}/instance/all`,
      {
        headers: { admintoken: this.adminToken },
      },
      'Failed to fetch instances'
    );

    return Array.isArray(instances) ? instances.map(i => this.normalizeInstance(i)) : [];
  }

  async createInstance({ name, systemName = 'ruptur-cloud', adminField01, adminField02 } = {}) {
    if (!this.adminToken) {
      throw new ProviderAdapterError('Admin token required', 'MISSING_CREDENTIALS');
    }
    if (!name) {
      throw new ProviderAdapterError('Instance name required', 'INVALID_PAYLOAD');
    }

    return this.fetchJson(
      `${this.serverUrl}/instance/create`,
      {
        method: 'POST',
        headers: {
          admintoken: this.adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          systemName,
          ...(adminField01 ? { adminField01 } : {}),
          ...(adminField02 ? { adminField02 } : {}),
        }),
      },
      'Failed to create instance'
    );
  }

  async getInstance(instanceId) {
    const instance = await this.fetchJson(
      `${this.serverUrl}/instance/status`,
      {
        headers: { token: instanceId },
      },
      'Failed to fetch instance'
    );

    return this.normalizeInstance(instance);
  }

  async sendMessage(instanceId, payload = {}) {
    const { to, type = 'text', content, mediaUrl, ...rest } = payload;
    const number = payload.number || to;

    if (type === 'text') {
      return this.sendText(instanceId, { number, text: payload.text || content, ...rest });
    }

    if (type === 'media' || ['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
      return this.sendMedia(instanceId, {
        number,
        type: payload.mediaType || (type === 'media' ? payload.typeMedia || 'image' : type),
        file: payload.file || mediaUrl || payload.url,
        text: payload.text || content,
        ...rest,
      });
    }

    if (type === 'contact') return this.sendContact(instanceId, { number, ...rest });
    if (type === 'location') return this.sendLocation(instanceId, { number, ...rest });
    if (type === 'menu') return this.sendMenu(instanceId, { number, text: payload.text || content, ...rest });
    if (type === 'carousel') return this.sendCarousel(instanceId, { number, text: payload.text || content, ...rest });
    if (type === 'pix-button') return this.sendPixButton(instanceId, { number, text: payload.text || content, ...rest });
    if (type === 'request-payment') return this.sendRequestPayment(instanceId, { number, text: payload.text || content, ...rest });
    if (type === 'location-button') return this.sendLocationButton(instanceId, { number, text: payload.text || content, ...rest });
    if (type === 'status') return this.sendStatus(instanceId, { text: payload.text || content, ...rest });

    throw new ProviderAdapterError(`Unsupported message type: ${type}`, 'INVALID_MESSAGE_TYPE');
  }

  async sendText(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/text', {
      method: 'POST',
      body: payload,
    }, 'Failed to send text message');
  }

  async sendMedia(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/media', {
      method: 'POST',
      body: payload,
    }, 'Failed to send media message');
  }

  async sendContact(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/contact', {
      method: 'POST',
      body: payload,
    }, 'Failed to send contact message');
  }

  async sendLocation(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/location', {
      method: 'POST',
      body: payload,
    }, 'Failed to send location message');
  }

  async sendMenu(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/menu', {
      method: 'POST',
      body: payload,
    }, 'Failed to send menu message');
  }

  async sendCarousel(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/carousel', {
      method: 'POST',
      body: payload,
    }, 'Failed to send carousel message');
  }

  async sendPixButton(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/pix-button', {
      method: 'POST',
      body: payload,
    }, 'Failed to send PIX button');
  }

  async sendRequestPayment(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/request-payment', {
      method: 'POST',
      body: payload,
    }, 'Failed to send payment request');
  }

  // Spec: POST /send/location-button — localização com botão interativo.
  // FIX: era chamado em modules/campaigns/index.js sem existir aqui (quebrava em runtime).
  async sendLocationButton(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/location-button', {
      method: 'POST',
      body: payload,
    }, 'Failed to send location button');
  }

  // Spec: POST /send/status — publica status (stories) na instância.
  async sendStatus(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/send/status', {
      method: 'POST',
      body: payload,
    }, 'Failed to send status');
  }

  // ── Disparo em massa nativo (/sender/*) — arquitetura híbrida de campanhas ──
  // A uazapi enfileira/dispara do lado dela e devolve um folder_id, que usamos
  // como id da campanha remota para controle (/sender/edit) e reconciliação.

  // Spec: POST /sender/simple — campanha simples (mesma mensagem para vários números).
  async senderSimple(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/sender/simple', {
      method: 'POST',
      body: payload,
    }, 'Failed to create simple sender');
  }

  // Spec: POST /sender/advanced — campanha avançada (lista de mensagens heterogêneas,
  // suporta text/media/button/carousel/location, delayMin/Max e scheduled_for).
  async senderAdvanced(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/sender/advanced', {
      method: 'POST',
      body: payload,
    }, 'Failed to create advanced sender');
  }

  // Spec: POST /sender/edit — controle da campanha remota.
  // action: 'stop' (pausar) | 'continue' (retomar) | 'delete' (remover não-enviadas).
  async senderEdit(instanceId, { folder_id, action } = {}) {
    return this.instanceRequest(instanceId, '/sender/edit', {
      method: 'POST',
      body: { folder_id, action },
    }, 'Failed to edit sender');
  }

  // Spec: POST /sender/listfolders — lista campanhas (folders) da instância com status/contadores.
  async senderListFolders(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/sender/listfolders', {
      method: 'POST',
      body: payload,
    }, 'Failed to list sender folders');
  }

  // Spec: POST /sender/listmessages — lista mensagens de uma campanha (folder) com status de cada envio.
  async senderListMessages(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/sender/listmessages', {
      method: 'POST',
      body: payload,
    }, 'Failed to list sender messages');
  }

  async updateInstancePresence(instanceId, presence) {
    return this.fetchJson(
      `${this.serverUrl}/instance/presence`,
      {
        method: 'POST',
        headers: {
          token: instanceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ presence }),
      },
      'Failed to update presence'
    );
  }

  async getInstanceStatus(instanceId) {
    return this.fetchJson(
      `${this.serverUrl}/instance/status`,
      {
        headers: { token: instanceId },
      },
      'Failed to get instance status'
    );
  }

  async connectInstance(instanceId, { phone } = {}) {
    return this.fetchJson(
      `${this.serverUrl}/instance/connect`,
      {
        method: 'POST',
        headers: {
          token: instanceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(phone ? { phone } : {}),
      },
      'Failed to connect instance'
    );
  }

  async disconnectInstance(instanceId) {
    return this.fetchJson(
      `${this.serverUrl}/instance/disconnect`,
      {
        method: 'POST',
        headers: { token: instanceId },
      },
      'Failed to disconnect instance'
    );
  }

  async deleteInstance(instanceId) {
    return this.instanceRequest(instanceId, '/instance', { method: 'DELETE' }, 'Failed to delete instance');
  }

  async resetInstance(instanceId) {
    return this.instanceRequest(instanceId, '/instance/reset', { method: 'POST' }, 'Failed to reset instance');
  }

  async updateInstanceName(instanceId, name) {
    return this.instanceRequest(instanceId, '/instance/updateInstanceName', {
      method: 'POST',
      body: { name },
    }, 'Failed to update instance name');
  }

  async getWAMessageLimits(instanceId) {
    return this.instanceRequest(instanceId, '/instance/wa_messages_limits', {}, 'Failed to get WhatsApp message limits');
  }

  async updateDelaySettings(instanceId, settings = {}) {
    return this.instanceRequest(instanceId, '/instance/updateDelaySettings', {
      method: 'POST',
      body: settings,
    }, 'Failed to update delay settings');
  }

  async getProxyConfig(instanceId) {
    return this.instanceRequest(instanceId, '/instance/proxy', {}, 'Failed to get proxy config');
  }

  async updateProxyConfig(instanceId, proxyConfig = {}) {
    return this.instanceRequest(instanceId, '/instance/proxy', {
      method: 'POST',
      body: proxyConfig,
    }, 'Failed to update proxy config');
  }

  async deleteProxyConfig(instanceId) {
    return this.instanceRequest(instanceId, '/instance/proxy', { method: 'DELETE' }, 'Failed to delete proxy config');
  }

  async getWebhook(instanceId) {
    return this.instanceRequest(instanceId, '/webhook', {}, 'Failed to get webhook');
  }

  async updateWebhook(instanceId, webhookConfig = {}) {
    return this.instanceRequest(instanceId, '/webhook', {
      method: 'POST',
      body: webhookConfig,
    }, 'Failed to update webhook');
  }

  async getWebhookErrors(instanceId) {
    return this.instanceRequest(instanceId, '/webhook/errors', {}, 'Failed to get webhook errors');
  }

  async getInstancePrivacy(instanceId) {
    return this.instanceRequest(instanceId, '/instance/privacy', {}, 'Failed to get privacy settings');
  }

  async setPrivacySetting(instanceId, privacySettings = {}) {
    return this.instanceRequest(instanceId, '/instance/privacy', {
      method: 'POST',
      body: privacySettings,
    }, 'Failed to update privacy settings');
  }

  async updateProfileName(instanceId, name) {
    return this.instanceRequest(instanceId, '/profile/name', {
      method: 'POST',
      body: { name },
    }, 'Failed to update profile name');
  }

  async updateProfileImage(instanceId, imagePayload = {}) {
    return this.instanceRequest(instanceId, '/profile/image', {
      method: 'POST',
      body: imagePayload,
    }, 'Failed to update profile image');
  }

  async getAsyncQueueStatus(instanceId) {
    return this.instanceRequest(instanceId, '/message/async', {}, 'Failed to get async queue');
  }

  async clearAsyncQueue(instanceId) {
    return this.instanceRequest(instanceId, '/message/async', { method: 'DELETE' }, 'Failed to clear async queue');
  }

  async downloadMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/download', { method: 'POST', body: payload }, 'Failed to download message');
  }

  async findMessages(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/find', { method: 'POST', body: payload }, 'Failed to find messages');
  }

  async requestHistorySync(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/history-sync', { method: 'POST', body: payload }, 'Failed to request history sync');
  }

  async markMessageRead(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/markread', { method: 'POST', body: payload }, 'Failed to mark message as read');
  }

  async reactToMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/react', { method: 'POST', body: payload }, 'Failed to react to message');
  }

  async deleteMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/delete', { method: 'POST', body: payload }, 'Failed to delete message');
  }

  async editMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/edit', { method: 'POST', body: payload }, 'Failed to edit message');
  }

  async pinMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/pin', { method: 'POST', body: payload }, 'Failed to pin message');
  }

  async checkContacts(instanceId) {
    return this.instanceRequest(instanceId, '/contacts', {}, 'Failed to check contacts');
  }

  async listContacts(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/contacts/list', { method: 'POST', body: payload }, 'Failed to list contacts');
  }

  async addContact(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/contact/add', { method: 'POST', body: payload }, 'Failed to add contact');
  }

  async removeContact(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/contact/remove', { method: 'POST', body: payload }, 'Failed to remove contact');
  }

  async checkChat(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/check', { method: 'POST', body: payload }, 'Failed to check chat');
  }

  async findChats(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/find', { method: 'POST', body: payload }, 'Failed to find chats');
  }

  async getChatDetails(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/details', { method: 'POST', body: payload }, 'Failed to get chat details');
  }

  async markChatRead(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/read', { method: 'POST', body: payload }, 'Failed to mark chat read');
  }

  async archiveChat(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/archive', { method: 'POST', body: payload }, 'Failed to archive chat');
  }

  async muteChat(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/mute', { method: 'POST', body: payload }, 'Failed to mute chat');
  }

  async pinChat(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/pin', { method: 'POST', body: payload }, 'Failed to pin chat');
  }

  async listLabels(instanceId) {
    return this.instanceRequest(instanceId, '/labels', {}, 'Failed to list labels');
  }

  async refreshLabels(instanceId) {
    return this.instanceRequest(instanceId, '/labels/refresh', { method: 'POST', body: {} }, 'Failed to refresh labels');
  }

  async editLabel(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/label/edit', { method: 'POST', body: payload }, 'Failed to edit label');
  }

  async getBusinessProfile(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/get/profile', { method: 'POST', body: payload }, 'Failed to get business profile');
  }

  async getBusinessCategories(instanceId) {
    return this.instanceRequest(instanceId, '/business/get/categories', {}, 'Failed to get business categories');
  }

  async updateBusinessProfile(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/update/profile', { method: 'POST', body: payload }, 'Failed to update business profile');
  }

  async getGlobalWebhook() {
    return this.adminRequest('/globalwebhook', {}, 'Failed to get global webhook');
  }

  async updateGlobalWebhook(webhookConfig = {}) {
    return this.adminRequest('/globalwebhook', {
      method: 'POST',
      body: webhookConfig,
    }, 'Failed to update global webhook');
  }

  async getGlobalWebhookErrors() {
    return this.adminRequest('/globalwebhook/errors', {}, 'Failed to get global webhook errors');
  }

  async updateAdminFields({ id, adminField01, adminField02 } = {}) {
    if (!this.adminToken) {
      throw new ProviderAdapterError('Admin token required', 'MISSING_CREDENTIALS');
    }
    if (!id) {
      throw new ProviderAdapterError('Instance id required', 'INVALID_PAYLOAD');
    }

    return this.fetchJson(
      `${this.serverUrl}/instance/updateAdminFields`,
      {
        method: 'POST',
        headers: {
          admintoken: this.adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, adminField01, adminField02 }),
      },
      'Failed to update admin fields'
    );
  }

  // --- Novas rotas (OpenAPI 2.1.0 coverage) ---
  
  // Instance
  async updateFieldsMap(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/instance/updateFieldsMap', { method: 'POST', body: payload }, 'Failed to update fields map');
  }
  async updateMessagePresence(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/message/presence', { method: 'POST', body: payload }, 'Failed to send message presence');
  }

  // Proxy
  async getProxyManagedCities() {
    return this.fetchJson(`${this.serverUrl}/proxy-managed/cities`, {}, 'Failed to get proxy managed cities');
  }

  // Group
  async createGroup(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/create', { method: 'POST', body: payload }, 'Failed to create group');
  }
  async getGroupInfo(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/info', { method: 'POST', body: payload }, 'Failed to get group info');
  }
  async getGroupInviteInfo(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/inviteInfo', { method: 'POST', body: payload }, 'Failed to get group invite info');
  }
  async joinGroup(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/join', { method: 'POST', body: payload }, 'Failed to join group');
  }
  async leaveGroup(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/leave', { method: 'POST', body: payload }, 'Failed to leave group');
  }
  async listGroups(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/list', { method: 'POST', body: payload }, 'Failed to list groups');
  }
  async resetGroupInviteCode(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/resetInviteCode', { method: 'POST', body: payload }, 'Failed to reset group invite code');
  }
  async updateGroupAnnounce(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateAnnounce', { method: 'POST', body: payload }, 'Failed to update group announce');
  }
  async updateGroupJoinApproval(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateJoinApproval', { method: 'POST', body: payload }, 'Failed to update group join approval');
  }
  async updateGroupMemberAddMode(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateMemberAddMode', { method: 'POST', body: payload }, 'Failed to update group member add mode');
  }
  async updateGroupDescription(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateDescription', { method: 'POST', body: payload }, 'Failed to update group description');
  }
  async updateGroupEphemeral(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/ephemeral', { method: 'POST', body: payload }, 'Failed to update group ephemeral settings');
  }
  async updateGroupImage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateImage', { method: 'POST', body: payload }, 'Failed to update group image');
  }
  async updateGroupLocked(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateLocked', { method: 'POST', body: payload }, 'Failed to update group locked');
  }
  async updateGroupName(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateName', { method: 'POST', body: payload }, 'Failed to update group name');
  }
  async updateGroupParticipants(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/group/updateParticipants', { method: 'POST', body: payload }, 'Failed to update group participants');
  }

  // Community
  async createCommunity(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/community/create', { method: 'POST', body: payload }, 'Failed to create community');
  }
  async editCommunityGroups(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/community/editgroups', { method: 'POST', body: payload }, 'Failed to edit community groups');
  }

  // Newsletter (Channels)
  async createNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/create', { method: 'POST', body: payload }, 'Failed to create newsletter');
  }
  async listNewsletters(instanceId) {
    return this.instanceRequest(instanceId, '/newsletter/list', { method: 'GET' }, 'Failed to list newsletters');
  }
  async getNewsletterInfo(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/info', { method: 'POST', body: payload }, 'Failed to get newsletter info');
  }
  async getNewsletterLink(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/link', { method: 'POST', body: payload }, 'Failed to get newsletter link');
  }
  async subscribeNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/subscribe', { method: 'POST', body: payload }, 'Failed to subscribe newsletter');
  }
  async getNewsletterMessages(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/messages', { method: 'POST', body: payload }, 'Failed to get newsletter messages');
  }
  async editNewsletterMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/messages/edit', { method: 'POST', body: payload }, 'Failed to edit newsletter message');
  }
  async deleteNewsletterMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/messages/delete', { method: 'POST', body: payload }, 'Failed to delete newsletter message');
  }
  async getNewsletterUpdates(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/updates', { method: 'POST', body: payload }, 'Failed to get newsletter updates');
  }
  async markNewsletterViewed(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/viewed', { method: 'POST', body: payload }, 'Failed to mark newsletter viewed');
  }
  async reactNewsletterMessage(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/reaction', { method: 'POST', body: payload }, 'Failed to react to newsletter message');
  }
  async followNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/follow', { method: 'POST', body: payload }, 'Failed to follow newsletter');
  }
  async unfollowNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/unfollow', { method: 'POST', body: payload }, 'Failed to unfollow newsletter');
  }
  async muteNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/mute', { method: 'POST', body: payload }, 'Failed to mute newsletter');
  }
  async unmuteNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/unmute', { method: 'POST', body: payload }, 'Failed to unmute newsletter');
  }
  async deleteNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/delete', { method: 'POST', body: payload }, 'Failed to delete newsletter');
  }
  async updateNewsletterPicture(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/picture', { method: 'POST', body: payload }, 'Failed to update newsletter picture');
  }
  async updateNewsletterName(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/name', { method: 'POST', body: payload }, 'Failed to update newsletter name');
  }
  async updateNewsletterDescription(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/description', { method: 'POST', body: payload }, 'Failed to update newsletter description');
  }
  async updateNewsletterSettings(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/settings', { method: 'POST', body: payload }, 'Failed to update newsletter settings');
  }
  async searchNewsletter(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/search', { method: 'POST', body: payload }, 'Failed to search newsletter');
  }
  async inviteNewsletterAdmin(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/admin/invite', { method: 'POST', body: payload }, 'Failed to invite newsletter admin');
  }
  async acceptNewsletterAdmin(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/admin/accept', { method: 'POST', body: payload }, 'Failed to accept newsletter admin');
  }
  async removeNewsletterAdmin(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/admin/remove', { method: 'POST', body: payload }, 'Failed to remove newsletter admin');
  }
  async revokeNewsletterAdmin(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/admin/revoke', { method: 'POST', body: payload }, 'Failed to revoke newsletter admin');
  }
  async transferNewsletterOwner(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/newsletter/owner/transfer', { method: 'POST', body: payload }, 'Failed to transfer newsletter owner');
  }

  // SSE
  async connectSSE(instanceId) {
    return this.instanceRequest(instanceId, '/sse', { method: 'GET' }, 'Failed to connect SSE');
  }

  // Sender
  async senderClearDone(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/sender/cleardone', { method: 'POST', body: payload }, 'Failed to clear done sender tasks');
  }
  async senderClearAll(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/sender/clearall', { method: 'POST', body: payload }, 'Failed to clear all sender tasks');
  }

  // Chat
  async blockChat(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/block', { method: 'POST', body: payload }, 'Failed to block chat');
  }
  async getChatBlocklist(instanceId) {
    return this.instanceRequest(instanceId, '/chat/blocklist', { method: 'GET' }, 'Failed to get chat blocklist');
  }
  async getChatLabels(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/labels', { method: 'POST', body: payload }, 'Failed to get chat labels');
  }
  async deleteChat(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/delete', { method: 'POST', body: payload }, 'Failed to delete chat');
  }
  async updateChatEphemeral(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/ephemeral', { method: 'POST', body: payload }, 'Failed to update chat ephemeral');
  }
  async getChatNotes(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/notes', { method: 'POST', body: payload }, 'Failed to get chat notes');
  }
  async refreshChatNotes(instanceId) {
    return this.instanceRequest(instanceId, '/chat/notes/refresh', { method: 'POST', body: {} }, 'Failed to refresh chat notes');
  }
  async editChatNotes(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/notes/edit', { method: 'POST', body: payload }, 'Failed to edit chat notes');
  }
  async editChatLead(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chat/editLead', { method: 'POST', body: payload }, 'Failed to edit chat lead');
  }

  // Quick Replies
  async editQuickReply(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/quickreply/edit', { method: 'POST', body: payload }, 'Failed to edit quick reply');
  }
  async showAllQuickReplies(instanceId) {
    return this.instanceRequest(instanceId, '/quickreply/showall', { method: 'GET' }, 'Failed to get quick replies');
  }

  // Call
  async makeCall(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/call/make', { method: 'POST', body: payload }, 'Failed to make call');
  }
  async rejectCall(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/call/reject', { method: 'POST', body: payload }, 'Failed to reject call');
  }

  // Chatwoot
  async updateChatwootConfig(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/chatwoot/config', { method: 'POST', body: payload }, 'Failed to update chatwoot config');
  }

  // Business Catalog
  async listBusinessCatalog(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/catalog/list', { method: 'POST', body: payload }, 'Failed to list business catalog');
  }
  async getBusinessCatalogInfo(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/catalog/info', { method: 'POST', body: payload }, 'Failed to get business catalog info');
  }
  async deleteBusinessCatalogProduct(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/catalog/delete', { method: 'POST', body: payload }, 'Failed to delete business catalog product');
  }
  async showBusinessCatalogProduct(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/catalog/show', { method: 'POST', body: payload }, 'Failed to show business catalog product');
  }
  async hideBusinessCatalogProduct(instanceId, payload = {}) {
    return this.instanceRequest(instanceId, '/business/catalog/hide', { method: 'POST', body: payload }, 'Failed to hide business catalog product');
  }

  // Admin Operations
  async restartAdmin() {
    return this.adminRequest('/admin/restart', { method: 'POST' }, 'Failed to restart admin service');
  }
  async rotateAdminToken() {
    return this.adminRequest('/admin/token/rotate', { method: 'POST' }, 'Failed to rotate admin token');
  }

  normalizeInstance(raw) {
    return {
      id: raw.token || raw.id,
      name: raw.name || raw.profileName || 'Unknown',
      status: raw.status || 'disconnected',
      number: raw.status?.status?.jid?.user || raw.owner || null,
      isBusiness: raw.isBusiness ?? false,
      platform: raw.platform || raw.plataform || 'Unknown',
      metadata: {
        id: raw.id,
        token: raw.token,
        systemName: raw.systemName,
        paircode: raw.paircode,
        qrcode: raw.qrcode,
        profileName: raw.profileName,
        profilePicUrl: raw.profilePicUrl,
        adminField01: raw.adminField01,
        adminField02: raw.adminField02,
        lastDisconnect: raw.lastDisconnect,
        lastDisconnectReason: raw.lastDisconnectReason,
        raw,
      },
    };
  }


  // --- NOVOS MÉTODOS UAZAPI 2.1.0 ---
  
  async updateFieldsMap(instanceId, fieldsMap) {
    return this.instanceRequest(instanceId, '/instance/updateFieldsMap', { method: 'POST', body: { fieldsMap } });
  }
  async getProxyManagedCities() {
    return this.adminRequest('/proxy/managed-cities');
  }
  async updateMessagePresence(instanceId, payload) {
    return this.instanceRequest(instanceId, '/message/presence', { method: 'POST', body: payload });
  }

  async createGroup(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/create', { method: 'POST', body: payload });
  }
  async getGroupInfo(instanceId, groupId) {
    return this.instanceRequest(instanceId, `/group/info/${groupId}`);
  }
  async getGroupInviteInfo(instanceId, inviteCode) {
    return this.instanceRequest(instanceId, `/group/inviteInfo/${inviteCode}`);
  }
  async editGroupInfo(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/edit', { method: 'POST', body: payload });
  }
  async getGroupAdmins(instanceId, groupId) {
    return this.instanceRequest(instanceId, `/group/admins/${groupId}`);
  }
  async getGroupMembers(instanceId, groupId) {
    return this.instanceRequest(instanceId, `/group/members/${groupId}`);
  }
  async editGroupMembers(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/members/edit', { method: 'POST', body: payload });
  }
  async leaveGroup(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/leave', { method: 'POST', body: payload });
  }
  async getGroupInviteLink(instanceId, groupId) {
    return this.instanceRequest(instanceId, `/group/inviteLink/${groupId}`);
  }
  async revokeGroupInviteLink(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/inviteLink/revoke', { method: 'POST', body: payload });
  }
  async setGroupPic(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/pic/set', { method: 'POST', body: payload });
  }
  async groupEphemeral(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/ephemeral', { method: 'POST', body: payload });
  }

  async createCommunity(instanceId, payload) {
    return this.instanceRequest(instanceId, '/community/create', { method: 'POST', body: payload });
  }
  async editCommunityGroups(instanceId, payload) {
    return this.instanceRequest(instanceId, '/community/groups/edit', { method: 'POST', body: payload });
  }

  async createNewsletter(instanceId, payload) {
    return this.instanceRequest(instanceId, '/newsletter/create', { method: 'POST', body: payload });
  }
  async listNewsletters(instanceId) {
    return this.instanceRequest(instanceId, '/newsletter/list');
  }
  async getNewsletterInfo(instanceId, newsletterId) {
    return this.instanceRequest(instanceId, `/newsletter/info/${newsletterId}`);
  }
  async muteNewsletter(instanceId, payload) {
    return this.instanceRequest(instanceId, '/newsletter/mute', { method: 'POST', body: payload });
  }
  async editNewsletterMembers(instanceId, payload) {
    return this.instanceRequest(instanceId, '/newsletter/members/edit', { method: 'POST', body: payload });
  }
  async deleteNewsletter(instanceId, payload) {
    return this.instanceRequest(instanceId, '/newsletter/delete', { method: 'POST', body: payload });
  }

  connectSSE(instanceId) {
    if (!instanceId) throw new ProviderAdapterError('Instance token required', 'MISSING_CREDENTIALS');
    return `${this.serverUrl}/sse/messages?token=${instanceId}`;
  }

  async blockChat(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/block', { method: 'POST', body: payload });
  }
  async getChatBlocklist(instanceId) {
    return this.instanceRequest(instanceId, '/chat/blocklist');
  }
  async getChatLabels(instanceId) {
    return this.instanceRequest(instanceId, '/chat/labels');
  }
  async deleteChat(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/delete', { method: 'POST', body: payload });
  }
  async updateChatEphemeral(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/ephemeral', { method: 'POST', body: payload });
  }
  async getChatNotes(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/notes', { method: 'POST', body: payload });
  }
  async refreshChatNotes(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/notes/refresh', { method: 'POST', body: payload });
  }
  async editChatNotes(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/notes/edit', { method: 'POST', body: payload });
  }
  async editChatLead(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/editLead', { method: 'POST', body: payload });
  }

  async editQuickReply(instanceId, payload) {
    return this.instanceRequest(instanceId, '/quickreply/edit', { method: 'POST', body: payload });
  }
  async showAllQuickReplies(instanceId) {
    return this.instanceRequest(instanceId, '/quickreply/showAll');
  }

  async makeCall(instanceId, payload) {
    return this.instanceRequest(instanceId, '/call/make', { method: 'POST', body: payload });
  }
  async rejectCall(instanceId, payload) {
    return this.instanceRequest(instanceId, '/call/reject', { method: 'POST', body: payload });
  }

  async getChatwootConfig(instanceId) {
    return this.instanceRequest(instanceId, '/chatwoot/config');
  }
  async updateChatwootConfig(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chatwoot/config', { method: 'POST', body: payload });
  }

  async listBusinessCatalog(instanceId, number) {
    return this.instanceRequest(instanceId, `/catalog/list/${number}`);
  }

  async restartAdmin(payload = {}) {
    return this.adminRequest('/admin/restart', { method: 'POST', body: payload });
  }
  async rotateAdminToken(payload = {}) {
    return this.adminRequest('/admin/rotateToken', { method: 'POST', body: payload });
  }

  normalizeCredentials(raw) {

    return {
      serverUrl: raw.serverUrl || 'https://tiatendeai.uazapi.com',
      adminToken: raw.adminToken,
      instanceToken: raw.instanceToken,
    };
  }
  // ─── MÉTODOS ADICIONADOS PARA OPENAPI 2.1.0 (CHATS, GRUPOS, CHATWOOT, ETC) ───
  
  async getChatwootConfig(instanceId) {
    return this.instanceRequest(instanceId, '/chatwoot/config', { method: 'GET' }, 'Failed to get Chatwoot config');
  }

  async updateChatwootConfig(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chatwoot/config', { method: 'POST', body: payload }, 'Failed to update Chatwoot config');
  }

  async editLead(instanceId, chatId, fields) {
    return this.instanceRequest(instanceId, '/chat/editLead', { 
      method: 'POST', 
      body: { id: chatId, ...fields } 
    }, 'Failed to edit lead');
  }

  async connectSSE(instanceId) {
    return this.instanceRequest(instanceId, '/instance/sse', { method: 'GET' }, 'Failed to connect SSE');
  }

  async findChats(instanceId, payload) {
    return this.instanceRequest(instanceId, '/chat/find', { method: 'POST', body: payload }, 'Failed to find chats');
  }

  async findMessages(instanceId, payload) {
    return this.instanceRequest(instanceId, '/message/find', { method: 'POST', body: payload }, 'Failed to find messages');
  }

  async markRead(instanceId, number) {
    return this.instanceRequest(instanceId, '/chat/read', { method: 'POST', body: { number, read: true } }, 'Failed to mark read');
  }

  async blockChat(instanceId, number, action = 'block') {
    return this.instanceRequest(instanceId, '/chat/block', { method: 'POST', body: { number, action } }, 'Failed to block/unblock chat');
  }

  async getChatBlocklist(instanceId) {
    return this.instanceRequest(instanceId, '/chat/blocklist', { method: 'GET' }, 'Failed to get blocklist');
  }

  async getChatLabels(instanceId) {
    return this.instanceRequest(instanceId, '/labels', { method: 'GET' }, 'Failed to get labels');
  }

  async deleteChat(instanceId, number) {
    return this.instanceRequest(instanceId, '/chat/delete', { method: 'POST', body: { number } }, 'Failed to delete chat');
  }

  async updateChatEphemeral(instanceId, number, duration) {
    return this.instanceRequest(instanceId, '/chat/ephemeral', { method: 'POST', body: { number, duration } }, 'Failed to update ephemeral');
  }

  async getChatNotes(instanceId, number) {
    return this.instanceRequest(instanceId, '/chat/notes', { method: 'POST', body: { number } }, 'Failed to get chat notes');
  }

  async refreshChatNotes(instanceId, number, force = false) {
    return this.instanceRequest(instanceId, '/chat/notes/refresh', { method: 'POST', body: { number, force } }, 'Failed to refresh chat notes');
  }

  async editChatNotes(instanceId, number, notes) {
    return this.instanceRequest(instanceId, '/chat/notes/edit', { method: 'POST', body: { number, notes } }, 'Failed to edit chat notes');
  }

  async updateMessagePresence(instanceId, number, presence, delay) {
    return this.instanceRequest(instanceId, '/message/presence', { method: 'POST', body: { number, presence, delay } }, 'Failed to update presence');
  }

  async createGroup(instanceId, payload) {
    return this.instanceRequest(instanceId, '/group/create', { method: 'POST', body: payload }, 'Failed to create group');
  }

  async getGroupInfo(instanceId, groupJid) {
    return this.instanceRequest(instanceId, '/group/find', { method: 'POST', body: { id: groupJid } }, 'Failed to get group info');
  }

  async getGroupInviteInfo(instanceId, inviteCode) {
    return this.instanceRequest(instanceId, '/group/inviteInfo', { method: 'POST', body: { inviteCode } }, 'Failed to get group invite info');
  }

  async createCommunity(instanceId, payload) {
    return this.instanceRequest(instanceId, '/community/create', { method: 'POST', body: payload }, 'Failed to create community');
  }

  async editCommunityGroups(instanceId, payload) {
    return this.instanceRequest(instanceId, '/community/editGroups', { method: 'POST', body: payload }, 'Failed to edit community groups');
  }

  async createNewsletter(instanceId, payload) {
    return this.instanceRequest(instanceId, '/newsletter/create', { method: 'POST', body: payload }, 'Failed to create newsletter');
  }

  async listNewsletters(instanceId) {
    return this.instanceRequest(instanceId, '/newsletter/list', { method: 'GET' }, 'Failed to list newsletters');
  }

  async editQuickReply(instanceId, payload) {
    return this.instanceRequest(instanceId, '/quickreply/edit', { method: 'POST', body: payload }, 'Failed to edit quick reply');
  }

  async showAllQuickReplies(instanceId) {
    return this.instanceRequest(instanceId, '/quickreply/all', { method: 'GET' }, 'Failed to get quick replies');
  }

  async makeCall(instanceId, payload) {
    return this.instanceRequest(instanceId, '/call/make', { method: 'POST', body: payload }, 'Failed to make call');
  }

  async rejectCall(instanceId, payload) {
    return this.instanceRequest(instanceId, '/call/reject', { method: 'POST', body: payload }, 'Failed to reject call');
  }

  async listBusinessCatalog(instanceId, jid) {
    return this.instanceRequest(instanceId, '/business/catalog', { method: 'POST', body: { jid } }, 'Failed to get catalog');
  }

  async updateFieldsMap(instanceId, fieldsMap) {
    return this.instanceRequest(instanceId, '/instance/fieldsMap', { method: 'POST', body: { fieldsMap } }, 'Failed to update fields map');
  }

  async getProxyManagedCities(instanceId) {
    return this.instanceRequest(instanceId, '/proxy/managedCities', { method: 'GET' }, 'Failed to get proxy managed cities');
  }

  async restartAdmin() {
    return this.adminRequest('/admin/restart', { method: 'POST' }, 'Failed to restart admin');
  }

  async rotateAdminToken() {
    return this.adminRequest('/admin/rotateToken', { method: 'POST' }, 'Failed to rotate admin token');
  }


}

export function createUazapiAdapter(credentials) {
  return new UazapiAdapter(credentials);
}

/**
 * Monta o array `choices` da UazAPI (/sender/simple e /sender/advanced) a partir
 * dos botões da campanha.
 *
 * Formato UazAPI:
 *   - botão de resposta (sem link): apenas o texto → "Texto do Botão"
 *   - botão de URL: texto e URL separados por pipe → "Texto do Botão|https://link.com"
 *
 * Regra de negócio (documentada): o WhatsApp Web NÃO permite misturar botões de
 * URL com botões de resposta no mesmo conjunto (gera aviso/inconsistência). Por
 * isso, se ALGUM botão tiver url, o conjunto é tratado como conjunto de URL e os
 * botões SEM url são descartados (caminho mais simples e seguro — evita um
 * payload misto inválido). Se NENHUM botão tiver url, mantém-se o comportamento
 * legado (somente texto).
 *
 * @param {Array<{text?: string, url?: string}|string>} buttons
 * @returns {string[]} choices no formato aceito pela UazAPI
 */
export function buildButtonChoices(buttons) {
  const list = (Array.isArray(buttons) ? buttons : [])
    .map((b) => (typeof b === 'string' ? { text: b } : (b || {})))
    .filter((b) => b.text && String(b.text).trim());

  const hasUrl = list.some((b) => b.url && String(b.url).trim());

  if (!hasUrl) {
    // Legado: botões de resposta, só texto.
    return list.map((b) => String(b.text).trim());
  }

  // Conjunto de URL: mantém só os botões com url (descarta os sem link para
  // não gerar um conjunto misto inválido no WhatsApp Web).
  return list
    .filter((b) => b.url && String(b.url).trim())
    .map((b) => `${String(b.text).trim()}|${String(b.url).trim()}`);
}
