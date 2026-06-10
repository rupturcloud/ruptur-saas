/**
 * CRM Module — Pipelines/Stages do funil (Kanban)
 *
 * Os CARDS vivem na UAZAPI (chats com lead_status/lead_kanbanOrder/lead_tags).
 * Aqui gerenciamos apenas a DEFINIÇÃO das colunas do funil (crm_pipelines /
 * crm_stages), persistidas no Supabase por tenant. Cada coluna mapeia para um
 * lead_status canônico usado no /chat/editLead da uazapi.
 *
 * Tabelas: migration 026_crm_pipelines.sql
 */

// Colunas padrão criadas no primeiro acesso de um tenant (funil de vendas clássico).
export const DEFAULT_STAGES = [
  { name: 'Novo',        lead_status: 'novo',        position: 0, color: '#6E7681' },
  { name: 'Contato',     lead_status: 'contato',     position: 1, color: '#3B82F6' },
  { name: 'Qualificado', lead_status: 'qualificado', position: 2, color: '#A855F7' },
  { name: 'Proposta',    lead_status: 'proposta',    position: 3, color: '#FF6A3D' },
  { name: 'Ganho',       lead_status: 'ganho',       position: 4, color: '#22C55E', is_won: true },
  { name: 'Perdido',     lead_status: 'perdido',     position: 5, color: '#EF4444', is_lost: true },
];

export class CrmManager {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Garante que o tenant tem um pipeline default com as colunas padrão.
   * Idempotente: cria só se não existir. Retorna { pipeline, stages }.
   */
  async ensurePipeline(tenantId, instanceKey = null) {
    let { data: pipeline, error } = await this.supabase
      .from('crm_pipelines')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .maybeSingle();
    if (error) throw new Error(`Erro ao buscar pipeline: ${error.message}`);

    if (!pipeline) {
      const { data: created, error: cErr } = await this.supabase
        .from('crm_pipelines')
        .insert({ tenant_id: tenantId, name: 'Funil principal', is_default: true, instance_key: instanceKey })
        .select('*')
        .single();
      if (cErr) throw new Error(`Erro ao criar pipeline: ${cErr.message}`);
      pipeline = created;

      const rows = DEFAULT_STAGES.map((s) => ({ ...s, pipeline_id: pipeline.id, tenant_id: tenantId }));
      const { error: sErr } = await this.supabase.from('crm_stages').insert(rows);
      if (sErr) throw new Error(`Erro ao criar colunas padrão: ${sErr.message}`);
    }

    const stages = await this.getStages(pipeline.id, tenantId);
    return { pipeline, stages };
  }

  async getStages(pipelineId, tenantId) {
    const { data, error } = await this.supabase
      .from('crm_stages')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true });
    if (error) throw new Error(`Erro ao buscar colunas: ${error.message}`);
    return data || [];
  }

  async createStage(tenantId, pipelineId, { name, lead_status, position, color, is_won, is_lost }) {
    if (!name || !lead_status) throw new Error('name e lead_status obrigatórios');
    const { data, error } = await this.supabase
      .from('crm_stages')
      .insert({
        pipeline_id: pipelineId,
        tenant_id: tenantId,
        name,
        lead_status,
        position: position ?? 0,
        color: color || '#FF6A3D',
        is_won: !!is_won,
        is_lost: !!is_lost,
      })
      .select('*')
      .single();
    if (error) throw new Error(`Erro ao criar coluna: ${error.message}`);
    return data;
  }

  async updateStage(tenantId, stageId, patch = {}) {
    const allowed = ['name', 'color', 'position', 'is_won', 'is_lost'];
    const clean = {};
    for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
    const { data, error } = await this.supabase
      .from('crm_stages')
      .update(clean)
      .eq('id', stageId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw new Error(`Erro ao atualizar coluna: ${error.message}`);
    return data;
  }

  async deleteStage(tenantId, stageId) {
    const { error } = await this.supabase
      .from('crm_stages')
      .delete()
      .eq('id', stageId)
      .eq('tenant_id', tenantId);
    if (error) throw new Error(`Erro ao remover coluna: ${error.message}`);
    return true;
  }

  /** Reordena colunas: recebe [{ id, position }] e aplica em lote. */
  async reorderStages(tenantId, order = []) {
    for (const { id, position } of order) {
      const { error } = await this.supabase
        .from('crm_stages')
        .update({ position })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw new Error(`Erro ao reordenar: ${error.message}`);
    }
    return true;
  }
}

let _singleton = null;
export function createCrmManager(supabase) {
  _singleton = new CrmManager(supabase);
  return _singleton;
}
export function getCrmManager() {
  return _singleton;
}

export default CrmManager;
