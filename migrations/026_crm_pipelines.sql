-- ============================================================
-- 026: CRM — Pipelines e Stages (funil de vendas / Kanban)
--
-- Os CARDS do Kanban vivem na UAZAPI (chats com lead_status,
-- lead_kanbanOrder, lead_tags, lead_assignedAttendant_id). Aqui
-- persistimos apenas a DEFINIÇÃO das colunas do funil por tenant —
-- a uazapi guarda lead_status como texto livre, então mapeamos
-- cada coluna a um lead_status canônico.
--
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. crm_pipelines — um ou mais funis por tenant
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name         TEXT        NOT NULL DEFAULT 'Funil principal',
  description  TEXT,
  is_default   BOOLEAN     NOT NULL DEFAULT false,
  -- Instância UAZAPI a que este funil está associado (opcional; null = todas)
  instance_key TEXT,

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_tenant ON crm_pipelines(tenant_id);

-- ──────────────────────────────────────────────
-- 2. crm_stages — colunas do Kanban dentro de um funil
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_stages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id   UUID        NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name          TEXT        NOT NULL,
  -- lead_status canônico salvo na uazapi (/chat/editLead) para esta coluna
  lead_status   TEXT        NOT NULL,
  position      INTEGER     NOT NULL DEFAULT 0,
  color         TEXT        DEFAULT '#FF6A3D',
  -- marca colunas terminais (won/lost) para métricas
  is_won        BOOLEAN     NOT NULL DEFAULT false,
  is_lost       BOOLEAN     NOT NULL DEFAULT false,

  created_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (pipeline_id, lead_status)
);

CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON crm_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_tenant   ON crm_stages(tenant_id);

-- ──────────────────────────────────────────────
-- 3. RLS — isolamento por tenant
-- ──────────────────────────────────────────────
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_stages    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_pipelines_isolation ON crm_pipelines;
CREATE POLICY crm_pipelines_isolation ON crm_pipelines
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS crm_stages_isolation ON crm_stages;
CREATE POLICY crm_stages_isolation ON crm_stages
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_memberships
      WHERE user_id = auth.uid()
    )
  );
