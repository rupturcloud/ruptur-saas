/**
 * Padrão estruturado de chaves para o TanStack Query.
 * Mantém consistência e evita colisões no cache global.
 */
export const QUERY_KEYS = {
  // Dados de sessão/autenticação
  SESSION: ['auth', 'session'],
  ME: ['auth', 'me'],
  ENVIRONMENTS: ['auth', 'environments'],

  // Dados do Tenant Atual
  TENANT_DASHBOARD: (tenantId) => ['tenant', tenantId, 'dashboard'],
  TENANT_NUMBERS: (tenantId) => ['tenant', tenantId, 'numbers'],
  TENANT_CAMPAIGNS: (tenantId) => ['tenant', tenantId, 'campaigns'],
  TENANT_INBOX: (tenantId) => ['tenant', tenantId, 'inbox'],
  
  // Detalhes específicos
  CAMPAIGN_DETAILS: (tenantId, campaignId) => ['tenant', tenantId, 'campaign', campaignId],
};
