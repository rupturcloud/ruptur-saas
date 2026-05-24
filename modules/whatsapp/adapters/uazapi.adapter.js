/**
 * WhatsApp → UAZAPI adapter.
 *
 * Doutrina (docs/ROUTING_API_ARCHITECTURE.md):
 *  - Única fronteira do domínio whatsapp com fornecedor externo (UAZAPI).
 *  - Nenhum controller/service/repository sabe que UAZAPI existe.
 *  - Reusa o UazapiAdapter de baixo nível (modules/provider-adapter/uazapi-adapter.js)
 *    pra não duplicar lógica de fetch/auth.
 *
 * Padrão UAZAPI:
 *  - Operações admin  → header `admintoken: <adminToken>`
 *  - Operações de instância → header `token: <instanceToken>`
 *  - O `token` retornado no createInstance é o identificador E credencial da instância.
 *    NÃO confundir com `id` (UUID interno) — o `token` é o que vai em todas as chamadas.
 */
import { UazapiAdapter as LowLevelUazapi } from '../../provider-adapter/uazapi-adapter.js';

export class UazapiWhatsappAdapter {
  constructor({ adminToken, serverUrl, instanceToken } = {}) {
    this._client = new LowLevelUazapi({ adminToken, serverUrl, instanceToken });
    this._serverUrl = serverUrl || 'https://free.uazapi.com';
    this._adminToken = adminToken;
  }

  /**
   * Cria instância UAZAPI.
   * Retorna { providerId, instanceToken, status } neutro.
   *
   * IMPORTANTE: providerId === instanceToken === o campo `token` do response UAZAPI.
   * Esse valor vai para remote_instance_id no banco e é usado em TODAS as chamadas
   * subsequentes como header `token`.
   */
  async createInstance({ name }) {
    const res = await this._client.createInstance({ name });
    // A UAZAPI retorna: { token, id, name, status, ... }
    // `token` é o identificador de autenticação da instância.
    // `id` é o UUID interno — NÃO serve para autenticar chamadas.
    const instanceToken = res?.token || res?.instance?.token;
    const internalId    = res?.id    || res?.instance?.id;
    if (!instanceToken) {
      throw new Error(`UAZAPI createInstance não retornou token. Response: ${JSON.stringify(res)}`);
    }
    return {
      providerId:    instanceToken,   // o que fica em remote_instance_id
      instanceToken: instanceToken,   // explícito para clareza
      internalId:    internalId,      // UUID interno (só para log/debug)
      status:        res?.status || res?.instance?.status || 'DISCONNECTED',
    };
  }

  /**
   * Inicia conexão e devolve QR + pairing code padronizado.
   * @param {string} instanceToken — valor de remote_instance_id (= token UAZAPI)
   * @param {{ phone?: string }} opts — phone → pairing code; omitido → QR code
   */
  async startSession(instanceToken, { phone } = {}) {
    const res = await this._client.connectInstance(instanceToken, phone ? { phone } : {});
    // UAZAPI /instance/connect retorna { connected, loggedIn, jid, instance }
    // QR fica em instance.qrcode; paircode em instance.paircode
    const inst = res?.instance || {};
    return {
      qrCode:      inst.qrcode      || res?.qrcode      || res?.qr          || null,
      pairingCode: inst.paircode    || res?.paircode    || res?.pairingCode  || null,
      status:      res?.connected   ? 'connected' : (res?.loggedIn ? 'connected' : 'PENDING'),
    };
  }

  /**
   * Estado da sessão (connected / disconnected / connecting).
   *
   * O spec /instance/status retorna:
   *   {
   *     instance: { status: "connected"|"disconnected"|"connecting", owner, lastDisconnect, ... },
   *     status:   { connected: bool, loggedIn: bool, jid: { user, server, ... } }
   *   }
   *
   * - status textual → res.instance.status (string)
   * - phone          → res.status.jid.user (NÃO res.status.status.jid.user — duplo .status era bug)
   * - lastSeen       → res.instance.lastDisconnect
   *
   * @param {string} instanceToken
   * @returns {{ status: string, phone: string|null, lastSeen: string|null }}
   */
  async getStatus(instanceToken) {
    const res = await this._client.getInstanceStatus(instanceToken);
    // res.instance = objeto Instance (tem .status como string de texto)
    const inst      = res?.instance || {};
    // res.status   = objeto { connected: bool, loggedIn: bool, jid: { user, server, ... } }
    const statusObj = res?.status   || {};
    // status textual: prioridade para inst.status (spec garante "connected"|"disconnected"|"connecting")
    const textStatus = inst.status
      || (statusObj.connected ? 'connected' : statusObj.loggedIn ? 'connected' : null)
      || 'disconnected';
    return {
      status:   textStatus,
      phone:    statusObj?.jid?.user || inst.owner || null,
      lastSeen: inst.lastDisconnect  || null,
    };
  }

  /**
   * Métricas de saúde.
   * A UAZAPI free não tem endpoint dedicado de health — usamos /instance/status
   * e extraímos o que estiver disponível.
   * @param {string} instanceToken
   */
  async getHealth(instanceToken) {
    const res = await this._client.getInstanceStatus(instanceToken);
    return {
      uptime:       res?.uptime        ?? null,
      msgsToday:    res?.msgsToday     ?? res?.messagesToday ?? null,
      deliveryRate: res?.deliveryRate  ?? null,
      score:        res?.health        ?? null,
    };
  }

  /**
   * Retorna configuração atual do webhook da instância.
   * @param {string} instanceToken
   */
  async getWebhook(instanceToken) {
    return this._client.getWebhook(instanceToken);
  }

  /**
   * Configura webhook da instância no padrão UAZAPI.
   * ATENÇÃO: o spec usa `addUrlTypesMessages` (com "s" em Types) — não confundir com
   * `addUrlTypeMessages`. O campo incorreto seria silenciosamente ignorado pela API.
   * @param {string} instanceToken
   * @param {object} config — { url, enabled, events, addUrlEvents, addUrlTypesMessages }
   */
  async setWebhook(instanceToken, config = {}) {
    return this._client.updateWebhook(instanceToken, {
      url:                 config.url                 ?? '',
      enabled:             config.enabled             ?? true,
      events:              config.events              ?? ['messages_update'],
      addUrlEvents:        config.addUrlEvents        ?? false,
      // Nome correto per spec: addUrlTypesMessages (plural "Types")
      addUrlTypesMessages: config.addUrlTypesMessages ?? config.addUrlTypeMessages ?? false,
    });
  }

  /**
   * Desconecta instância.
   * @param {string} instanceToken
   */
  async disconnect(instanceToken) {
    return this._client.disconnectInstance(instanceToken);
  }

  /**
   * Deleta instância do provider.
   * @param {string} instanceToken
   */
  async deleteInstance(instanceToken) {
    return this._client.deleteInstance(instanceToken);
  }
}

export default UazapiWhatsappAdapter;
