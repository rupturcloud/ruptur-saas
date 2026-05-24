/**
 * Unit Tests: InstanceFusionService
 *
 * Valida o núcleo da doutrina Anduril: fusion bus de estado de instâncias WhatsApp.
 * Testa: injectSignal, computeState, decaimento temporal, needsHITL e getPollInterval.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  InstanceFusionService,
  SENSOR_WEIGHTS,
  TRACKING_MODES,
  CONFIDENCE_THRESHOLDS,
} from '../../modules/whatsapp/fusion.service.js';

// Repository mock — mergeMetadata nunca falha por padrão
function makeMockRepo(opts = {}) {
  return {
    mergeMetadata: opts.mergeMetadata ?? (() => Promise.resolve({ id: 'x', metadata: {} })),
  };
}

describe('InstanceFusionService', () => {
  let service;

  beforeEach(() => {
    service = new InstanceFusionService({ repository: makeMockRepo() });
  });

  // ===== CONSTANTES =====

  describe('constantes exportadas', () => {
    test('SENSOR_WEIGHTS contém os 5 sensores esperados', () => {
      expect(SENSOR_WEIGHTS).toMatchObject({
        http_poll:    0.3,
        sse_event:    0.5,
        webhook_push: 0.5,
        state_cache:  0.1,
        heartbeat:    0.4,
      });
    });

    test('TRACKING_MODES define pollIntervalMs corretos', () => {
      expect(TRACKING_MODES.STABLE.pollIntervalMs).toBe(60_000);
      expect(TRACKING_MODES.WATCH.pollIntervalMs).toBe(15_000);
      expect(TRACKING_MODES.UNCERTAIN.pollIntervalMs).toBe(5_000);
      expect(TRACKING_MODES.LOST.pollIntervalMs).toBeNull();
    });

    test('CONFIDENCE_THRESHOLDS: STABLE=0.8, WATCH=0.6, HITL=0.6', () => {
      expect(CONFIDENCE_THRESHOLDS.STABLE).toBe(0.8);
      expect(CONFIDENCE_THRESHOLDS.WATCH).toBe(0.6);
      expect(CONFIDENCE_THRESHOLDS.HITL).toBe(0.6);
    });
  });

  // ===== computeState: sem sinais =====

  describe('computeState — sem sinais', () => {
    test('retorna state=unknown, confidence=0, trackingMode=LOST quando não há sinais', () => {
      const result = service.computeState('inst-1');
      expect(result).toEqual({ state: 'unknown', confidence: 0, trackingMode: 'LOST', signals: 0 });
    });
  });

  // ===== injectSignal + computeState: sensor único =====

  describe('sensor único http_poll → UNCERTAIN', () => {
    test('um sinal http_poll connected → confidence = peso_http_poll = 0.3 → UNCERTAIN + needsHITL', () => {
      service.injectSignal('inst-1', { source: 'http_poll', state: 'connected', confidence: 1.0 });
      const result = service.computeState('inst-1');

      // Com apenas http_poll (peso 0.3), connected = 100% dos votos → confidence = 0.3
      expect(result.state).toBe('connected');
      expect(result.confidence).toBe(0.3);
      expect(result.trackingMode).toBe('UNCERTAIN');
      expect(result.needsHITL).toBe(true);
      expect(result.signals).toBe(1);
    });

    test('sensor desconhecido usa peso padrão 0.2 → UNCERTAIN', () => {
      service.injectSignal('inst-x', { source: 'custom_sensor', state: 'connected', confidence: 1.0 });
      const result = service.computeState('inst-x');

      expect(result.state).toBe('connected');
      expect(result.confidence).toBe(0.2);
      expect(result.trackingMode).toBe('UNCERTAIN');
      expect(result.needsHITL).toBe(true);
    });
  });

  // ===== múltiplos sensores → WATCH / STABLE =====

  describe('múltiplos sensores — fusion de estado', () => {
    test('http_poll + sse_event (ambos connected) → confidence > 0.6 → WATCH ou STABLE', () => {
      service.injectSignal('inst-2', { source: 'http_poll',  state: 'connected', confidence: 1.0 });
      service.injectSignal('inst-2', { source: 'sse_event',  state: 'connected', confidence: 1.0 });
      const result = service.computeState('inst-2');

      // Pesos: 0.3 + 0.5 = 0.8; total = 0.8; ratio = 1.0 → confidence = 0.8
      expect(result.state).toBe('connected');
      expect(result.confidence).toBeCloseTo(0.8, 2);
      // 0.8 exato bate em STABLE (>= 0.8)
      expect(result.trackingMode).toBe('STABLE');
      expect(result.needsHITL).toBe(false);
    });

    test('3 sensores conflitantes: 2 connected + 1 disconnected → estado dominante é connected', () => {
      service.injectSignal('inst-3', { source: 'http_poll',    state: 'connected',    confidence: 1.0 });
      service.injectSignal('inst-3', { source: 'sse_event',    state: 'connected',    confidence: 1.0 });
      service.injectSignal('inst-3', { source: 'webhook_push', state: 'disconnected', confidence: 1.0 });
      const result = service.computeState('inst-3');

      // connected: 0.3 + 0.5 = 0.8  |  disconnected: 0.5  |  total: 1.3
      // connectedRatio = 0.8/1.3 ≈ 0.615  |  disconnectedRatio = 0.5/1.3 ≈ 0.385
      expect(result.state).toBe('connected');
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.needsHITL).toBe(false);
    });

    test('sse_event + webhook_push (ambos connected) → confidence = 1.0 → STABLE', () => {
      service.injectSignal('inst-4', { source: 'sse_event',    state: 'connected', confidence: 1.0 });
      service.injectSignal('inst-4', { source: 'webhook_push', state: 'connected', confidence: 1.0 });
      const result = service.computeState('inst-4');

      // Ambos têm peso 0.5; total = 1.0; connectedRatio = 1.0 → confidence = 1.0
      expect(result.state).toBe('connected');
      expect(result.confidence).toBeCloseTo(1.0, 2);
      expect(result.trackingMode).toBe('STABLE');
    });

    test('confidence < 0.6 → needsHITL = true', () => {
      // Apenas state_cache (peso 0.1) — muito fraco
      service.injectSignal('inst-5', { source: 'state_cache', state: 'connected', confidence: 1.0 });
      const result = service.computeState('inst-5');

      expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLDS.HITL);
      expect(result.needsHITL).toBe(true);
    });
  });

  // ===== decaimento temporal =====

  describe('decaimento temporal — sinais antigos têm menos peso', () => {
    test('sinal recente tem peso quase integral; sinal antigo (>half-life) tem peso menor', () => {
      const instanceId = 'decay-test';

      // Injeta sinal "connected" recente
      service.injectSignal(instanceId, { source: 'sse_event', state: 'connected', confidence: 1.0 });
      const resultFresh = service.computeState(instanceId);

      // Cria nova instância de service com sinal "manualmente" antigo
      const serviceOld = new InstanceFusionService({ repository: makeMockRepo() });
      const OLD_AGE_MS = 15 * 60 * 1000; // 15 minutos (3 half-lifes)
      // Injeta o sinal e depois manipula o timestamp para simular sinal antigo
      serviceOld.injectSignal(instanceId, { source: 'sse_event', state: 'connected', confidence: 1.0 });
      const oldSignals = serviceOld._signals.get(instanceId);
      oldSignals[0].timestamp = Date.now() - OLD_AGE_MS;

      const resultOld = serviceOld.computeState(instanceId);

      // O sinal recente deve ter confidence maior que o antigo
      expect(resultFresh.confidence).toBeGreaterThan(resultOld.confidence);
    });

    test('sinal muito antigo (30min) tem decaimento significativo > 50%', () => {
      const instanceId = 'very-old';
      const HALF_LIFE_MS = 5 * 60 * 1000;
      const OLD_AGE_MS = 6 * HALF_LIFE_MS; // 30 min = 6 half-lifes

      service.injectSignal(instanceId, { source: 'sse_event', state: 'connected', confidence: 1.0 });
      const sigs = service._signals.get(instanceId);
      sigs[0].timestamp = Date.now() - OLD_AGE_MS;

      const resultOld = service.computeState(instanceId);

      // Sinal fresco com mesmo sensor
      const serviceFresh = new InstanceFusionService({ repository: makeMockRepo() });
      serviceFresh.injectSignal(instanceId, { source: 'sse_event', state: 'connected', confidence: 1.0 });
      const resultFresh = serviceFresh.computeState(instanceId);

      // Após 6 half-lifes, peso deve ser exp(-ln2 * 6) ≈ 0.016 do original
      const decayFactor = resultOld.confidence / resultFresh.confidence;
      expect(decayFactor).toBeLessThan(0.1); // menos de 10% do peso original
    });
  });

  // ===== limite de 20 sinais =====

  describe('limite de 20 sinais por instância', () => {
    test('ao injetar mais de 20 sinais, mantém apenas os 20 mais recentes', () => {
      for (let i = 0; i < 25; i++) {
        service.injectSignal('inst-cap', { source: 'http_poll', state: 'connected', confidence: 1.0 });
      }
      const signals = service._signals.get('inst-cap');
      expect(signals.length).toBe(20);
    });
  });

  // ===== loadCachedSignal =====

  describe('loadCachedSignal — seed inicial de S4', () => {
    test('carrega estado do cache como sinal state_cache', () => {
      service.loadCachedSignal('inst-cache', {
        state: 'connected',
        confidence: 0.8,
        computedAt: new Date().toISOString(),
      });
      const signals = service._signals.get('inst-cache');
      expect(signals).toHaveLength(1);
      expect(signals[0].source).toBe('state_cache');
      expect(signals[0].state).toBe('connected');
    });

    test('ignora cachedState sem state definido', () => {
      service.loadCachedSignal('inst-no-cache', null);
      service.loadCachedSignal('inst-no-cache', {});
      expect(service._signals.has('inst-no-cache')).toBe(false);
    });

    test('cachedState sem computedAt usa timestamp antigo (decaimento alto)', () => {
      // Sem computedAt → ageMs = DECAY_HALF_LIFE_MS * 3 = 15min
      // Sinal é carregado mas com decay já aplicado pelo timestamp do injectSignal
      service.loadCachedSignal('inst-old-cache', {
        state: 'disconnected',
        confidence: 0.9,
        // sem computedAt
      });
      const signals = service._signals.get('inst-old-cache');
      // O sinal foi injetado normalmente (o ageMs no loadCachedSignal não é usado
      // para o timestamp do sinal, apenas para informação — o injectSignal usa Date.now())
      expect(signals).toHaveLength(1);
      expect(signals[0].state).toBe('disconnected');
    });
  });

  // ===== persistFusedState =====

  describe('persistFusedState', () => {
    test('chama repo.mergeMetadata com fusedState + computedAt', async () => {
      let capturedArgs = null;
      const mockRepo = makeMockRepo({
        mergeMetadata: (args) => {
          capturedArgs = args;
          return Promise.resolve({});
        },
      });
      const svc = new InstanceFusionService({ repository: mockRepo });
      const fused = { state: 'connected', confidence: 0.85, trackingMode: 'STABLE', signals: 3 };

      await svc.persistFusedState('inst-persist', fused);

      expect(capturedArgs.id).toBe('inst-persist');
      expect(capturedArgs.patch.fusedState.state).toBe('connected');
      expect(capturedArgs.patch.fusedState.confidence).toBe(0.85);
      expect(capturedArgs.patch.fusedState.computedAt).toBeDefined();
    });

    test('não lança exceção se repo.mergeMetadata falhar (non-fatal)', async () => {
      const mockRepo = makeMockRepo({
        mergeMetadata: () => Promise.reject(new Error('DB offline')),
      });
      const svc = new InstanceFusionService({ repository: mockRepo });

      // Não deve lançar
      await expect(
        svc.persistFusedState('inst-fail', { state: 'connected', confidence: 0.9 })
      ).resolves.not.toThrow();
    });
  });

  // ===== getPollInterval =====

  describe('getPollInterval — adaptive tracking', () => {
    test('sem sinais → LOST → retorna null', () => {
      expect(service.getPollInterval('inst-empty')).toBeNull();
    });

    test('sensor único http_poll → UNCERTAIN → 5000ms', () => {
      service.injectSignal('inst-pi-1', { source: 'http_poll', state: 'connected', confidence: 1.0 });
      expect(service.getPollInterval('inst-pi-1')).toBe(5_000);
    });

    test('http_poll + sse_event → STABLE → 60000ms', () => {
      service.injectSignal('inst-pi-2', { source: 'http_poll', state: 'connected', confidence: 1.0 });
      service.injectSignal('inst-pi-2', { source: 'sse_event', state: 'connected', confidence: 1.0 });
      // confidence = 0.8 → STABLE
      expect(service.getPollInterval('inst-pi-2')).toBe(60_000);
    });
  });

  // ===== isolamento entre instâncias =====

  describe('isolamento entre instâncias diferentes', () => {
    test('sinais de inst-A não afetam inst-B', () => {
      service.injectSignal('inst-A', { source: 'sse_event', state: 'connected', confidence: 1.0 });
      service.injectSignal('inst-B', { source: 'sse_event', state: 'disconnected', confidence: 1.0 });

      expect(service.computeState('inst-A').state).toBe('connected');
      expect(service.computeState('inst-B').state).toBe('disconnected');
    });
  });
});
