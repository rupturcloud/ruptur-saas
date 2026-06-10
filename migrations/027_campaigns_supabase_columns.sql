-- 027_campaigns_supabase_columns.sql
-- Reconcilia a tabela public.campaigns com o backend NATIVO de campanhas
-- (persistência migrada de Bubble → Supabase em modules/campaigns/index.js).
--
-- Contexto: o container warmup-runtime passou a rodar o CampaignManager novo,
-- que grava/lê colunas que a tabela de produção (schema antigo) não possui:
--   [Campaigns] processScheduledCampaigns: column campaigns.status does not exist
--   [Campaigns] reconcileNativeCampaigns:  column campaigns.metadata does not exist
-- Sem estas colunas, LISTAR funciona (não filtra por status), mas CRIAR/LANÇAR falha.
--
-- 100% IDEMPOTENTE: ADD COLUMN IF NOT EXISTS não altera colunas já existentes,
-- então é seguro rodar mesmo que parte do schema já esteja presente.
-- Colunas espelham buildDbPayload() de modules/campaigns/index.js.

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS status            text DEFAULT 'draft';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS metadata          jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS message_template  text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS media_url         text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS media_type        text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS total_recipients  integer DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS sent_count        integer DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivered_count   integer DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS read_count        integer DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS failed_count      integer DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS scheduled_at      timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS started_at        timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS completed_at      timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS instance_id       text;

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);

-- Garante que linhas legadas tenham um status válido (não-nulo).
UPDATE public.campaigns SET status = 'draft' WHERE status IS NULL;
