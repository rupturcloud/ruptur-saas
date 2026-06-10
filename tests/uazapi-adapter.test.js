/**
 * Testes do UazapiAdapter — foco nos métodos adicionados na Fase 0
 * (sendLocationButton, sendStatus e a família /sender/* para campanhas híbridas).
 *
 * Estratégia: mock de global.fetch — valida URL, método, headers (token) e body
 * enviados para a UAZAPI, sem rede real.
 *
 * Uso: npm test -- tests/uazapi-adapter.test.js
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createUazapiAdapter, buildButtonChoices } from '../modules/provider-adapter/uazapi-adapter.js';

const SERVER = 'https://tiatendeai.uazapi.com';
const TOKEN = 'inst-token-123';

function mockFetchOnce(jsonBody = { ok: true }) {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  });
  global.fetch = fn;
  return fn;
}

function lastCall(fn) {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1];
  return { url, init, body: init?.body ? JSON.parse(init.body) : undefined };
}

describe('UazapiAdapter — Fase 0', () => {
  let adapter;
  beforeEach(() => {
    adapter = createUazapiAdapter({ serverUrl: SERVER, adminToken: 'admin', instanceToken: TOKEN });
  });

  test('sendLocationButton chama POST /send/location-button com header token', async () => {
    const fetchFn = mockFetchOnce();
    await adapter.sendLocationButton(TOKEN, { number: '5511999999999', latitude: -23.5, longitude: -46.6 });
    const { url, init, body } = lastCall(fetchFn);
    expect(url).toBe(`${SERVER}/send/location-button`);
    expect(init.method).toBe('POST');
    expect(init.headers.token).toBe(TOKEN);
    expect(body.latitude).toBe(-23.5);
  });

  test('sendStatus chama POST /send/status', async () => {
    const fetchFn = mockFetchOnce();
    await adapter.sendStatus(TOKEN, { type: 'text', text: 'oi' });
    expect(lastCall(fetchFn).url).toBe(`${SERVER}/send/status`);
  });

  test('senderAdvanced chama POST /sender/advanced com messages', async () => {
    const fetchFn = mockFetchOnce({ folder_id: 'folder-abc', status: 'scheduled' });
    const res = await adapter.senderAdvanced(TOKEN, {
      delayMin: 3, delayMax: 6,
      messages: [{ number: '5511999999999', type: 'text', text: 'oi' }],
    });
    const { url, init, body } = lastCall(fetchFn);
    expect(url).toBe(`${SERVER}/sender/advanced`);
    expect(init.method).toBe('POST');
    expect(body.messages).toHaveLength(1);
    expect(res.folder_id).toBe('folder-abc');
  });

  test('senderEdit envia folder_id e action no body', async () => {
    const fetchFn = mockFetchOnce();
    await adapter.senderEdit(TOKEN, { folder_id: 'folder-abc', action: 'stop' });
    const { url, body } = lastCall(fetchFn);
    expect(url).toBe(`${SERVER}/sender/edit`);
    expect(body).toEqual({ folder_id: 'folder-abc', action: 'stop' });
  });

  test('senderListFolders e senderListMessages chamam os paths certos', async () => {
    let fetchFn = mockFetchOnce({ folders: [] });
    await adapter.senderListFolders(TOKEN, {});
    expect(lastCall(fetchFn).url).toBe(`${SERVER}/sender/listfolders`);

    fetchFn = mockFetchOnce({ messages: [] });
    await adapter.senderListMessages(TOKEN, { folder_id: 'folder-abc' });
    expect(lastCall(fetchFn).url).toBe(`${SERVER}/sender/listmessages`);
  });
});

describe('buildButtonChoices — botões com texto e/ou URL', () => {
  test('botão com text+url vira choice "text|url"', () => {
    expect(buildButtonChoices([{ text: 'Acessar', url: 'https://ruptur.cloud' }]))
      .toEqual(['Acessar|https://ruptur.cloud']);
  });

  test('botão só com text mantém comportamento legado (só texto)', () => {
    expect(buildButtonChoices([{ text: 'Sim' }, { text: 'Não' }]))
      .toEqual(['Sim', 'Não']);
    // strings cruas (formato antigo) também funcionam
    expect(buildButtonChoices(['Sim', 'Não'])).toEqual(['Sim', 'Não']);
  });

  test('conjunto misto: havendo url, botões sem url são descartados (só choices de URL)', () => {
    const out = buildButtonChoices([
      { text: 'Site', url: 'https://a.com' },
      { text: 'Sem link' },
      { text: 'Loja', url: 'https://b.com' },
    ]);
    expect(out).toEqual(['Site|https://a.com', 'Loja|https://b.com']);
  });

  test('trims e ignora botões sem texto', () => {
    expect(buildButtonChoices([
      { text: '  Ir  ', url: '  https://c.com  ' },
      { text: '', url: 'https://d.com' },
    ])).toEqual(['Ir|https://c.com']);
  });

  test('entrada vazia/indefinida retorna array vazio', () => {
    expect(buildButtonChoices(undefined)).toEqual([]);
    expect(buildButtonChoices([])).toEqual([]);
  });
});

describe('UazapiAdapter — Fase 1 (Novos Endpoints)', () => {
  let adapter;
  let fetchFn;

  beforeEach(() => {
    adapter = createUazapiAdapter({ serverUrl: SERVER, adminToken: 'admin', instanceToken: TOKEN });
    fetchFn = mockFetchOnce({ success: true });
  });

  test('editLead chama POST /chat/editLead com payload correto', async () => {
    await adapter.editLead(TOKEN, '5511999999999@s.whatsapp.net', { lead_status: 'won', lead_tags: ['vip'] });
    const { url, init, body } = lastCall(fetchFn);
    expect(url).toBe(`${SERVER}/chat/editLead`);
    expect(init.method).toBe('POST');
    expect(init.headers.token).toBe(TOKEN);
    expect(body).toEqual({ id: '5511999999999@s.whatsapp.net', lead_status: 'won', lead_tags: ['vip'] });
  });

  test('createGroup chama POST /group/create com participantes', async () => {
    const fetchFnGrp = mockFetchOnce({ group_id: '12345-67890@g.us' });
    const res = await adapter.createGroup(TOKEN, { subject: 'Grupo VIP', participants: ['5511999999999'] });
    const { url, init, body } = lastCall(fetchFnGrp);
    expect(url).toBe(`${SERVER}/group/create`);
    expect(init.method).toBe('POST');
    expect(body.subject).toBe('Grupo VIP');
    expect(body.participants).toHaveLength(1);
    expect(res.group_id).toBe('12345-67890@g.us');
  });
});
