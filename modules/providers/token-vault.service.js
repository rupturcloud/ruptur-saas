/**
 * TokenVault — gerencia admintoken UAZAPI com rotação segura.
 *
 * Problema: UAZAPI free rotaciona tokens a cada 1h.
 * Solução: vault com TTL tracking + endpoint de update sem restart de container.
 *
 * Fluxo:
 *   1. Token configurado via POST /api/admin/uazapi/token (persiste no Supabase)
 *   2. Gateway lê do vault em cada request (não do process.env diretamente)
 *   3. Quando TTL < 10min → UI exibe alerta ao platform admin
 *   4. Platform admin cola novo token → vault atualiza sem restart
 */
import { decryptSecret } from './uazapi-account.service.js';

/** Cache TTL interno: 30s para não bater no Supabase em cada request */
const INTERNAL_CACHE_TTL_MS = 30_000;

/** Limiar de alerta de expiração: 10 minutos */
const EXPIRY_WARN_MS = 10 * 60 * 1000;

export class TokenVault {
  constructor({ supabase }) {
    this._supabase = supabase;
    this._cache = null; // { token, serverUrl, configuredAt, ttlMs, source, _fetchedAt }
  }

  /**
   * Retorna as credenciais UAZAPI ativas.
   * Prioridade: Supabase (persistido) > process.env (fallback)
   *
   * @returns {{ serverUrl: string, adminToken: string, configuredAt: string|null, ttlMs: number, source: 'supabase'|'env', _fetchedAt: number }}
   */
  async getCredentials() {
    // Cache quente (< 30s): evita round-trips desnecessários
    if (this._cache && (Date.now() - this._cache._fetchedAt < INTERNAL_CACHE_TTL_MS)) {
      return this._cache;
    }

    // Tenta ler do Supabase (tabela provider_accounts)
    try {
      if (this._supabase) {
        const { data } = await this._supabase
          .from('provider_accounts')
          .select('server_url, admin_token_enc, token_configured_at, token_ttl_ms, account_kind')
          .eq('account_kind', 'free')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data?.admin_token_enc) {
          this._cache = {
            serverUrl:    data.server_url || 'https://free.uazapi.com',
            adminToken:   decryptSecret(data.admin_token_enc),
            configuredAt: data.token_configured_at,
            ttlMs:        data.token_ttl_ms || 3_600_000,
            source:       'supabase',
            _fetchedAt:   Date.now(),
          };
          return this._cache;
        }
      }
    } catch (e) {
      console.warn('[TokenVault] Supabase lookup failed, falling back to env:', e?.message);
    }

    // Fallback: process.env
    this._cache = {
      serverUrl:    process.env.UAZAPI_FREE_SERVER_URL || 'https://free.uazapi.com',
      adminToken:   process.env.UAZAPI_FREE_ADMIN_TOKEN || process.env.UAZAPI_ADMIN_TOKEN || '',
      configuredAt: null,
      ttlMs:        3_600_000,
      source:       'env',
      _fetchedAt:   Date.now(),
    };
    return this._cache;
  }

  /**
   * Invalida o cache interno (forçar re-leitura no próximo getCredentials).
   * Chamar após rotateAccount ou updateAccount via PATCH.
   */
  invalidate() {
    this._cache = null;
  }

  /**
   * Retorna status do token atual para uso em UI de alerta e GET /api/admin/uazapi/token/status.
   *
   * @returns {{ source, hasToken, serverUrl, configuredAt, remainingMs, remainingMin, isExpiringSoon, isExpired }}
   */
  async getStatus() {
    const creds = await this.getCredentials();
    const now = Date.now();

    let remainingMs = null;
    let isExpiringSoon = false;
    let isExpired = false;

    if (creds.configuredAt) {
      const configuredAt = new Date(creds.configuredAt).getTime();
      const age = now - configuredAt;
      remainingMs = Math.max(0, creds.ttlMs - age);
      isExpiringSoon = remainingMs < EXPIRY_WARN_MS;
      isExpired = remainingMs === 0;
    }

    return {
      source:        creds.source,
      hasToken:      !!creds.adminToken,
      serverUrl:     creds.serverUrl,
      configuredAt:  creds.configuredAt,
      remainingMs,
      remainingMin:  remainingMs !== null ? Math.floor(remainingMs / 60_000) : null,
      isExpiringSoon,
      isExpired,
    };
  }
}

export default TokenVault;
