/**
 * Unit Tests: UazapiWhatsappAdapter
 *
 * Valida o parsing correto das respostas UAZAPI:
 *  1. getStatus() — extrai status textual de res.instance.status (não de res.status que é objeto)
 *  2. getStatus() — extrai phone de res.status.jid.user (não res.status.status.jid.user)
 *  3. startSession() — extrai qrCode de res.instance.qrcode e pairingCode de res.instance.paircode
 *  4. createInstance() — extrai token de res.token (ou res.instance.token como fallback)
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { UazapiWhatsappAdapter } from '../../modules/whatsapp/adapters/uazapi.adapter.js';

// ─── helpers ───────────────────────────────────────────────────────────────

/**
 * Cria adapter com _client mockado para controle total.
 */
function makeAdapter() {
  const adapter = new UazapiWhatsappAdapter({
    adminToken:    'test-admin',
    serverUrl:     'https://test.uazapi.com',
    instanceToken: 'test-instance',
  });

  // Mock do cliente de baixo nível
  adapter._client = {
    fetchJson:         jest.fn(),
    getInstanceStatus: jest.fn(),
    connectInstance:   jest.fn(),
    createInstance:    jest.fn(),
  };

  return adapter;
}

// Resposta real do /instance/status conforme spec OpenAPI UAZAPI
const MOCK_STATUS_CONNECTED = {
  instance: {
    status:         'connected',
    owner:          '5511999999999',
    lastDisconnect: null,
    name:           'Minha Instância',
  },
  status: {
    connected: true,
    loggedIn:  true,
    jid: {
      user:   '5511999999999',
      server: 's.whatsapp.net',
      agent:  0,
      device: 0,
    },
  },
};

const MOCK_STATUS_DISCONNECTED = {
  instance: {
    status:         'disconnected',
    owner:          null,
    lastDisconnect: '2024-01-01T00:00:00Z',
  },
  status: {
    connected: false,
    loggedIn:  false,
    jid:       null,
  },
};

const MOCK_STATUS_CONNECTING = {
  instance: {
    status:  'connecting',
    owner:   null,
    qrcode:  'data:image/png;base64,iVBOR...',
    paircode: null,
  },
  status: {
    connected: false,
    loggedIn:  false,
    jid:       null,
  },
};

// ─── testes ────────────────────────────────────────────────────────────────

describe('UazapiWhatsappAdapter — parsing de respostas UAZAPI', () => {
  let adapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    test('retorna status "connected" a partir de res.instance.status (não de res.status que é objeto)', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(MOCK_STATUS_CONNECTED);

      const result = await adapter.getStatus('tok-abc');

      expect(result.status).toBe('connected');
      // Garante que não é o objeto booleano de res.status
      expect(typeof result.status).toBe('string');
    });

    test('extrai phone de res.status.jid.user (não res.status.status.jid.user)', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(MOCK_STATUS_CONNECTED);

      const result = await adapter.getStatus('tok-abc');

      expect(result.phone).toBe('5511999999999');
    });

    test('phone é null quando jid é null (instância desconectada)', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(MOCK_STATUS_DISCONNECTED);

      const result = await adapter.getStatus('tok-abc');

      expect(result.phone).toBeNull();
      expect(result.status).toBe('disconnected');
    });

    test('retorna status "connecting" quando instância está aguardando QR', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(MOCK_STATUS_CONNECTING);

      const result = await adapter.getStatus('tok-abc');

      expect(result.status).toBe('connecting');
    });

    test('lastSeen vem de res.instance.lastDisconnect', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(MOCK_STATUS_DISCONNECTED);

      const result = await adapter.getStatus('tok-abc');

      expect(result.lastSeen).toBe('2024-01-01T00:00:00Z');
    });

    test('lastSeen é null quando conectado (sem lastDisconnect)', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(MOCK_STATUS_CONNECTED);

      const result = await adapter.getStatus('tok-abc');

      expect(result.lastSeen).toBeNull();
    });

    test('fallback para owner quando jid.user não existe mas owner sim', async () => {
      const mockWithOwner = {
        instance: { status: 'connected', owner: '5511988887777' },
        status:   { connected: true, loggedIn: true, jid: null },
      };
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(mockWithOwner);

      const result = await adapter.getStatus('tok-abc');

      expect(result.phone).toBe('5511988887777');
    });

    test('fallback para "disconnected" quando instance.status está ausente', async () => {
      const mockSemStatus = {
        instance: {},
        status:   { connected: false, loggedIn: false, jid: null },
      };
      adapter._client.getInstanceStatus = jest.fn().mockResolvedValue(mockSemStatus);

      const result = await adapter.getStatus('tok-abc');

      expect(result.status).toBe('disconnected');
    });

    test('propaga erro quando getInstanceStatus falha', async () => {
      adapter._client.getInstanceStatus = jest.fn().mockRejectedValue(new Error('UAZAPI unreachable'));

      await expect(adapter.getStatus('tok-abc')).rejects.toThrow('UAZAPI unreachable');
    });
  });

  // ── startSession ──────────────────────────────────────────────────────────

  describe('startSession()', () => {
    test('extrai qrCode de res.instance.qrcode', async () => {
      const mockConnect = {
        connected: false,
        loggedIn:  false,
        jid:       null,
        instance: {
          qrcode:  'data:image/png;base64,iVBOR...',
          paircode: null,
          status:  'connecting',
        },
      };
      adapter._client.connectInstance = jest.fn().mockResolvedValue(mockConnect);

      const result = await adapter.startSession('tok-abc');

      expect(result.qrCode).toBe('data:image/png;base64,iVBOR...');
      expect(result.pairingCode).toBeNull();
      expect(result.status).toBe('PENDING');
    });

    test('extrai pairingCode de res.instance.paircode (fluxo phone)', async () => {
      const mockConnect = {
        connected: false,
        loggedIn:  false,
        jid:       null,
        instance: {
          qrcode:  null,
          paircode: 'ABC-DEF',
          status:  'connecting',
        },
      };
      adapter._client.connectInstance = jest.fn().mockResolvedValue(mockConnect);

      const result = await adapter.startSession('tok-abc', { phone: '5511999999999' });

      expect(result.qrCode).toBeNull();
      expect(result.pairingCode).toBe('ABC-DEF');
    });

    test('status "connected" quando res.connected é true', async () => {
      const mockConnect = {
        connected: true,
        loggedIn:  true,
        jid:       { user: '5511999999999' },
        instance:  { qrcode: null, paircode: null, status: 'connected' },
      };
      adapter._client.connectInstance = jest.fn().mockResolvedValue(mockConnect);

      const result = await adapter.startSession('tok-abc');

      expect(result.status).toBe('connected');
    });
  });

  // ── createInstance ────────────────────────────────────────────────────────

  describe('createInstance()', () => {
    test('extrai token de res.token (nível raiz do response)', async () => {
      const mockCreate = {
        response:  'Instance created successfully',
        token:     'tok-novo-123',
        connected: false,
        loggedIn:  false,
        instance: { id: 'uuid-interno', token: 'tok-novo-123', status: 'disconnected' },
      };
      adapter._client.createInstance = jest.fn().mockResolvedValue(mockCreate);

      const result = await adapter.createInstance({ name: 'Teste' });

      expect(result.providerId).toBe('tok-novo-123');
      expect(result.instanceToken).toBe('tok-novo-123');
    });

    test('fallback para res.instance.token quando res.token está ausente', async () => {
      const mockCreate = {
        response:  'Instance created successfully',
        // token ausente na raiz — deve cair no fallback
        instance: { id: 'uuid-interno', token: 'tok-fallback-456', status: 'disconnected' },
      };
      adapter._client.createInstance = jest.fn().mockResolvedValue(mockCreate);

      const result = await adapter.createInstance({ name: 'Teste' });

      expect(result.providerId).toBe('tok-fallback-456');
    });

    test('lança erro quando nem token nem instance.token estão presentes', async () => {
      adapter._client.createInstance = jest.fn().mockResolvedValue({
        response: 'Instance created successfully',
        instance: { id: 'uuid-interno' }, // sem token
      });

      await expect(adapter.createInstance({ name: 'Teste' })).rejects.toThrow(
        'UAZAPI createInstance não retornou token'
      );
    });

    test('internalId vem de res.id (ou res.instance.id como fallback)', async () => {
      const mockCreate = {
        token:     'tok-123',
        id:        'uuid-raiz',
        instance:  { id: 'uuid-dentro', token: 'tok-123', status: 'disconnected' },
      };
      adapter._client.createInstance = jest.fn().mockResolvedValue(mockCreate);

      const result = await adapter.createInstance({ name: 'Teste' });

      // res.id tem prioridade sobre res.instance.id
      expect(result.internalId).toBe('uuid-raiz');
    });
  });
});
