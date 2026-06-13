-- ==========================================
-- 027_crm_core_tables.sql
-- ==========================================
-- Criação das tabelas base para o CRM
-- crm_leads: Armazena os contatos (único por telefone/tenant)
-- crm_opportunities: Armazena as oportunidades/tickets de atendimento associados aos leads

-- 1. Tabela de Leads
CREATE TABLE IF NOT EXISTS crm_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}'::TEXT[],
    custom_fields JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    
    -- Um telefone deve ser único por tenant
    CONSTRAINT uq_crm_lead_phone_tenant UNIQUE (tenant_id, phone)
);

-- Índices de performance para Leads
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant ON crm_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone ON crm_leads(phone);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON crm_leads(assigned_user_id);

-- RLS para Leads
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Usuários veem leads do seu tenant" ON crm_leads;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Usuários veem leads do seu tenant"
    ON crm_leads FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenant_memberships 
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM user_tenant_memberships 
            WHERE user_id = auth.uid()
        )
    );

-- 2. Tabela de Oportunidades (Tickets)
CREATE TABLE IF NOT EXISTS crm_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(10,2) DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'NEW', -- Ex: NEW, CONTACTED, NEGOTIATION, WON, LOST
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED
    assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Índices de performance para Oportunidades
CREATE INDEX IF NOT EXISTS idx_crm_opps_tenant ON crm_opportunities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_lead ON crm_opportunities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_stage ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_opps_status ON crm_opportunities(status);

-- RLS para Oportunidades
ALTER TABLE crm_opportunities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Usuários veem oportunidades do seu tenant" ON crm_opportunities;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Usuários veem oportunidades do seu tenant"
    ON crm_opportunities FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenant_memberships 
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM user_tenant_memberships 
            WHERE user_id = auth.uid()
        )
    );

-- 3. Trigger para updated_at em crm_leads
CREATE OR REPLACE FUNCTION update_crm_leads_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_leads_updated_at ON crm_leads;
CREATE TRIGGER trg_crm_leads_updated_at
    BEFORE UPDATE ON crm_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_leads_updated_at();

-- 4. Trigger para updated_at em crm_opportunities
CREATE OR REPLACE FUNCTION update_crm_opps_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_opps_updated_at ON crm_opportunities;
CREATE TRIGGER trg_crm_opps_updated_at
    BEFORE UPDATE ON crm_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_opps_updated_at();
