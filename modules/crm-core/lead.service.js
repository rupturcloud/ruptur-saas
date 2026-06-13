/**
 * CRM Core — Lead & Opportunity Services
 *
 * Gerencia a lógica central do CRM (auto-creation de leads, movimentação de pipeline).
 */

/**
 * Encontra ou cria um Lead pelo telefone (dentro de um tenant).
 * O telefone no WhatsApp serve como chave natural única do contato.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tenantId
 * @param {string} phone - Telefone limpo (ex: "5511999999999")
 * @param {string} [name] - Nome opcional para salvar caso o lead não exista
 * @returns {Promise<object>} Objeto do Lead criado ou encontrado
 */
export async function findOrCreateLead(supabase, tenantId, phone, name = 'Contato WhatsApp') {
  if (!tenantId || !phone) throw new Error('tenantId e phone são obrigatórios para buscar Lead');

  // Limpar telefone de sufixos do WhatsApp (ex: @s.whatsapp.net)
  const cleanPhone = phone.split('@')[0];

  // 1. Tentar encontrar o Lead
  const { data: existing, error: findErr } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (findErr) throw new Error(`Erro ao buscar lead: ${findErr.message}`);
  if (existing) return existing;

  // 2. Se não existir, criar usando idempotência do banco (caso ocorra corrida)
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('crm_leads')
      .insert({
        tenant_id: tenantId,
        phone: cleanPhone,
        name: name,
        tags: [],
      })
      .select()
      .single();

    if (insertErr) {
      // Se deu conflito de constraint UNIQUE (corrida de inserts simultâneos)
      if (insertErr.code === '23505') {
        const { data: refetched } = await supabase
          .from('crm_leads')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('phone', cleanPhone)
          .single();
        return refetched;
      }
      throw insertErr;
    }
    return inserted;
  } catch (e) {
    throw new Error(`Erro ao criar lead: ${e.message}`);
  }
}

/**
 * Encontra uma oportunidade (Ticket) aberta para o lead.
 * Se não existir nenhuma 'OPEN', cria uma nova no estágio inicial ('NEW').
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tenantId
 * @param {string} leadId
 * @returns {Promise<object>} Oportunidade ativa
 */
export async function findOrCreateOpenOpportunity(supabase, tenantId, leadId) {
  if (!tenantId || !leadId) throw new Error('tenantId e leadId são obrigatórios');

  // 1. Buscar oportunidade ativa
  const { data: openOpp, error: findErr } = await supabase
    .from('crm_opportunities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) throw new Error(`Erro ao buscar oportunidade: ${findErr.message}`);
  if (openOpp) return openOpp;

  // 2. Criar nova oportunidade (Ticket)
  const ticketTitle = `Atendimento #${Date.now().toString().slice(-6)}`;
  
  const { data: newOpp, error: insertErr } = await supabase
    .from('crm_opportunities')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      title: ticketTitle,
      stage: 'NEW',
      status: 'OPEN'
    })
    .select()
    .single();

  if (insertErr) throw new Error(`Erro ao criar oportunidade: ${insertErr.message}`);
  return newOpp;
}

/**
 * Fluxo consolidado: Quando uma mensagem chega, garante que existe Lead e Oportunidade.
 */
export async function handleIncomingMessageCRM(supabase, tenantId, phone, pushName) {
  try {
    const lead = await findOrCreateLead(supabase, tenantId, phone, pushName);
    const opp = await findOrCreateOpenOpportunity(supabase, tenantId, lead.id);
    return { lead, opp };
  } catch (e) {
    console.error('[CRM Core] Erro na pipeline automática de mensagem:', e.message);
    return null;
  }
}
