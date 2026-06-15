/**
 * Migration 026: Corrigir tabelas de Analytics faltando em produção
 *
 * Problema: analytics_events e analytics_funnel_metrics (view) não existem
 * no schema do Supabase produção, causando erros recorrentes no gateway:
 *   [Analytics] Erro ao obter dashboard: Could not find the table 'public.analytics_events'
 *
 * Esta migration é idempotente (IF NOT EXISTS em todos os objetos).
 *
 * Origem: migrations/019_analytics_and_onboarding.sql (nunca aplicada em prod)
 * Data: 2026-06-13
 */

-- ========================================
-- 1. Tabela analytics_events
-- ========================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  -- Tipos suportados: signup, plan_viewed, checkout_start, checkout_complete,
  -- upgrade, trial_warning, trial_expired, churn

  properties JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent VARCHAR(500),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Índices para performance de queries analytics
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_id
  ON analytics_events(tenant_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type
  ON analytics_events(event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_event
  ON analytics_events(tenant_id, event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_created
  ON analytics_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_properties
  ON analytics_events USING GIN(properties);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_event_created
  ON analytics_events(tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type_tenant
  ON analytics_events(event_type, tenant_id);

-- ========================================
-- 2. Tabela onboarding_progress
-- ========================================
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  current_step SMALLINT DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 5),
  steps_progress JSONB DEFAULT jsonb_build_object(
    '1', jsonb_build_object('completed', false, 'completedAt', null),
    '2', jsonb_build_object('completed', false, 'completedAt', null),
    '3', jsonb_build_object('completed', false, 'completedAt', null),
    '4', jsonb_build_object('completed', false, 'completedAt', null),
    '5', jsonb_build_object('completed', false, 'completedAt', null)
  ),
  trial_starts_at TIMESTAMPTZ DEFAULT NOW(),
  trial_ends_at   TIMESTAMPTZ DEFAULT (NOW() + interval '7 days'),
  status          VARCHAR(50)  DEFAULT 'in_progress',
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant
  ON onboarding_progress(tenant_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_status
  ON onboarding_progress(status);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_trial_ends
  ON onboarding_progress(trial_ends_at);

-- ========================================
-- 3. View analytics_funnel_metrics
-- ========================================
CREATE OR REPLACE VIEW analytics_funnel_metrics AS
SELECT
  tenant_id,
  COUNT(DISTINCT CASE WHEN event_type = 'signup'            THEN user_id END) AS total_signups,
  COUNT(DISTINCT CASE WHEN event_type = 'plan_viewed'       THEN user_id END) AS plan_views,
  COUNT(DISTINCT CASE WHEN event_type = 'checkout_start'    THEN user_id END) AS checkout_starts,
  COUNT(DISTINCT CASE WHEN event_type = 'checkout_complete' THEN user_id END) AS checkout_completes,
  COUNT(DISTINCT CASE WHEN event_type = 'upgrade'           THEN user_id END) AS upgrades,

  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_type = 'plan_viewed' THEN user_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_type = 'signup' THEN user_id END), 0),
    2
  ) AS signup_to_plan_view_rate,

  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN user_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_type = 'plan_viewed' THEN user_id END), 0),
    2
  ) AS plan_view_to_checkout_rate,

  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_type = 'checkout_complete' THEN user_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN user_id END), 0),
    2
  ) AS checkout_completion_rate,

  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_type = 'upgrade' THEN user_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_type = 'signup' THEN user_id END), 0),
    2
  ) AS trial_to_paid_conversion_rate,

  MIN(created_at) AS first_event_at,
  MAX(created_at) AS last_event_at
FROM analytics_events
GROUP BY tenant_id;

-- ========================================
-- 4. RLS Policies (idempotentes via DROP IF EXISTS + CREATE)
-- ========================================
ALTER TABLE analytics_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- analytics_events: leitura pelo tenant
DROP POLICY IF EXISTS "Users can view analytics of their tenant" ON analytics_events;
CREATE POLICY "Users can view analytics of their tenant" ON analytics_events
  FOR SELECT USING (
    tenant_id IN (
      SELECT DISTINCT utm.tenant_id FROM user_tenant_memberships utm
      WHERE utm.user_id = auth.uid()
    )
  );

-- analytics_events: inserção pelo serviço backend
DROP POLICY IF EXISTS "Service can insert analytics events" ON analytics_events;
CREATE POLICY "Service can insert analytics events" ON analytics_events
  FOR INSERT WITH CHECK (true);

-- onboarding_progress: leitura pelo tenant
DROP POLICY IF EXISTS "Users can view onboarding progress of their tenant" ON onboarding_progress;
CREATE POLICY "Users can view onboarding progress of their tenant" ON onboarding_progress
  FOR SELECT USING (
    tenant_id IN (
      SELECT DISTINCT utm.tenant_id FROM user_tenant_memberships utm
      WHERE utm.user_id = auth.uid()
    )
  );

-- onboarding_progress: atualização/inserção pelo backend
DROP POLICY IF EXISTS "Service can update onboarding progress" ON onboarding_progress;
CREATE POLICY "Service can update onboarding progress" ON onboarding_progress
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Service can insert onboarding progress" ON onboarding_progress;
CREATE POLICY "Service can insert onboarding progress" ON onboarding_progress
  FOR INSERT WITH CHECK (true);

-- ========================================
-- 5. Função trigger updated_at (idempotente)
-- ========================================
CREATE OR REPLACE FUNCTION update_onboarding_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_onboarding_progress_updated_at ON onboarding_progress;
CREATE TRIGGER trigger_update_onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_progress_updated_at();

-- ========================================
-- Fim da migration 026
-- ========================================
-- Verificação pós-aplicação:
--   SELECT COUNT(*) FROM analytics_events;  -- deve retornar 0 (tabela vazia, ok)
--   SELECT * FROM analytics_funnel_metrics LIMIT 1;  -- deve retornar sem erro
