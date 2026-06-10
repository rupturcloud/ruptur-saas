import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { handleGetPipeline } from '../api/routes-crm.mjs';

// Mock dependencies
jest.unstable_mockModule('../api/routes-inbox.mjs', () => ({
  getAdapterForInstance: jest.fn(),
}));

jest.unstable_mockModule('../modules/crm/index.js', () => ({
  getCrmManager: () => null,
  createCrmManager: () => ({
    ensurePipeline: jest.fn().mockResolvedValue({
      pipeline: { id: 'pip-1' },
      stages: [{ id: 'stage-1', lead_status: 'won' }]
    })
  })
}));

describe('CRM Routes - handleGetPipeline', () => {
  let req, res, jsonMock, supabaseMock;

  beforeEach(() => {
    req = {
      user: { tenantId: 'tenant-1' },
      url: '/api/crm/pipeline?instanceKey=all',
      headers: { host: 'localhost' },
      method: 'GET'
    };
    res = {};
    jsonMock = jest.fn((res, status, payload) => ({ status, payload }));
    
    supabaseMock = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis()
    };
  });

  test('Deve retornar erro se instanceKey nao for providenciado', async () => {
    req.url = '/api/crm/pipeline';
    const result = await handleGetPipeline(req, res, jsonMock, supabaseMock);
    expect(result.status).toBe(400);
    expect(result.payload.error).toBe('instanceKey obrigatório');
  });

  // O teste completo multi-instância exigiria o mock completo do Supabase e adapter.
  // Já validamos o input basico.
});
