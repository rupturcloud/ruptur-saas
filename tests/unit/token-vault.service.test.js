/**
 * Testes unitários — TokenVault
 *
 * Cobertura:
 *  - getStatus() com token configurado há 55min → isExpiringSoon: true
 *  - getStatus() com token configurado há 10min → isExpiringSoon: false
 *  - Fallback para env quando Supabase retorna vazio
 *  - Invalidação de cache
 */
import { TokenVault } from '../../modules/providers/token-vault.service.js';

// Helper: cria mock do Supabase retornando um row específico
function makeSupabase(row) {
  const chain = {
    data: row,
    error: null,
  };
  const builder = {
    from:       () => builder,
    select:     () => builder,
    eq:         () => builder,
    order:      () => builder,
    limit:      () => builder,
    maybeSingle: () => Promise.resolve(chain),
  };
  return builder;
}

// Helper: cria mock do Supabase que lança erro
function makeFailingSupabase() {
  const builder = {
    from:       () => builder,
    select:     () => builder,
    eq:         () => builder,
    order:      () => builder,
    limit:      () => builder,
    maybeSingle: () => Promise.reject(new Error('connection error')),
  };
  return builder;
}

// Helper: token configurado há N minutos
function configuredAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

// Simula row Supabase com token já criptografado (versão clara para bypass no teste)
function fakeRow({ minutesAgo }) {
  return {
    server_url: 'https://free.uazapi.com',
    // Usamos valor direto (não criptografado) — no vault, decryptSecret('v1:...')
    // devolveria o token; aqui simulamos já descriptografado passando string sem prefixo v1:
    admin_token_enc: 'fake-plain-token',
    token_configured_at: configuredAgo(minutesAgo),
    token_ttl_ms: 3_600_000, // 1h
    account_kind: 'free',
  };
}

describe('TokenVault', () => {
  beforeEach(() => {
    // Garantir env limpa para testes de fallback
    delete process.env.UAZAPI_FREE_ADMIN_TOKEN;
    delete process.env.UAZAPI_ADMIN_TOKEN;
    delete process.env.UAZAPI_FREE_SERVER_URL;
  });

  // ──────────────────────────────────────────────
  // getStatus() — token perto de expirar (55min)
  // ──────────────────────────────────────────────
  it('retorna isExpiringSoon=true quando token tem < 10min restantes (configurado há 55min)', async () => {
    const supabase = makeSupabase(fakeRow({ minutesAgo: 55 }));
    const vault = new TokenVault({ supabase });

    const status = await vault.getStatus();

    expect(status.isExpiringSoon).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(status.remainingMin).toBeLessThan(10);
    expect(status.hasToken).toBe(true);
    expect(status.source).toBe('supabase');
  });

  // ──────────────────────────────────────────────
  // getStatus() — token recente (10min)
  // ──────────────────────────────────────────────
  it('retorna isExpiringSoon=false quando token tem > 10min restantes (configurado há 10min)', async () => {
    const supabase = makeSupabase(fakeRow({ minutesAgo: 10 }));
    const vault = new TokenVault({ supabase });

    const status = await vault.getStatus();

    expect(status.isExpiringSoon).toBe(false);
    expect(status.isExpired).toBe(false);
    expect(status.remainingMin).toBeGreaterThanOrEqual(49); // 60 - 10 - 1 de margem
    expect(status.hasToken).toBe(true);
    expect(status.source).toBe('supabase');
  });

  // ──────────────────────────────────────────────
  // Fallback para env quando Supabase retorna vazio
  // ──────────────────────────────────────────────
  it('usa env vars quando Supabase retorna registro vazio (data: null)', async () => {
    process.env.UAZAPI_FREE_ADMIN_TOKEN = 'env-token-abc123';
    process.env.UAZAPI_FREE_SERVER_URL = 'https://custom.uazapi.com';

    const supabase = makeSupabase(null); // Supabase sem resultado
    const vault = new TokenVault({ supabase });

    const creds = await vault.getCredentials();

    expect(creds.source).toBe('env');
    expect(creds.adminToken).toBe('env-token-abc123');
    expect(creds.serverUrl).toBe('https://custom.uazapi.com');
    expect(creds.configuredAt).toBeNull();
  });

  // ──────────────────────────────────────────────
  // Fallback para env quando Supabase lança erro
  // ──────────────────────────────────────────────
  it('usa env vars quando Supabase lança erro (rede/auth)', async () => {
    process.env.UAZAPI_ADMIN_TOKEN = 'fallback-token-xyz';

    const supabase = makeFailingSupabase();
    const vault = new TokenVault({ supabase });

    const creds = await vault.getCredentials();

    expect(creds.source).toBe('env');
    expect(creds.adminToken).toBe('fallback-token-xyz');
  });

  // ──────────────────────────────────────────────
  // Fallback sem Supabase configurado (null)
  // ──────────────────────────────────────────────
  it('usa env vars quando supabase=null (sem Supabase configurado)', async () => {
    process.env.UAZAPI_FREE_ADMIN_TOKEN = 'direct-env-token';

    const vault = new TokenVault({ supabase: null });
    const creds = await vault.getCredentials();

    expect(creds.source).toBe('env');
    expect(creds.adminToken).toBe('direct-env-token');
  });

  // ──────────────────────────────────────────────
  // Status sem configuredAt → remainingMs=null
  // ──────────────────────────────────────────────
  it('retorna remainingMs=null quando configuredAt é null (origem env)', async () => {
    process.env.UAZAPI_FREE_ADMIN_TOKEN = 'env-token';

    const vault = new TokenVault({ supabase: null });
    const status = await vault.getStatus();

    expect(status.remainingMs).toBeNull();
    expect(status.remainingMin).toBeNull();
    expect(status.isExpiringSoon).toBe(false);
    expect(status.isExpired).toBe(false);
  });

  // ──────────────────────────────────────────────
  // invalidate() força re-fetch
  // ──────────────────────────────────────────────
  it('invalidate() limpa cache e força nova leitura', async () => {
    let callCount = 0;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    callCount++;
                    return { data: fakeRow({ minutesAgo: 5 }), error: null };
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const vault = new TokenVault({ supabase });

    await vault.getCredentials(); // 1ª chamada → supabase
    await vault.getCredentials(); // 2ª → cache (< 30s)
    expect(callCount).toBe(1);

    vault.invalidate();
    await vault.getCredentials(); // 3ª → supabase de novo
    expect(callCount).toBe(2);
  });
});
