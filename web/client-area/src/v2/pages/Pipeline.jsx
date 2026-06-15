/**
 * Crm.jsx — CRM / Pipeline / Kanban (V0 laranja)
 *
 * Quadro Kanban de leads. As colunas vêm do funil do tenant (crm_stages,
 * Supabase); os cards são os chats da UAZAPI agrupados por lead_status.
 *
 * Mover um card entre colunas grava lead_status + lead_kanbanOrder via
 * /chat/editLead (atualização otimista no estado local). Clicar num card abre
 * um Drawer com os dados do lead (nome, tags, notas) editáveis.
 *
 * Backend: crm.api.js → gateway /api/crm/* → { Supabase + UAZAPI }.
 * Drag-and-drop: HTML5 nativo (sem dependência externa).
 */
import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Drawer, Button, Input, EmptyState, Skeleton } from '../../ds/index.js';
import { inboxApi } from '../../api/inbox.api.js';
import { supabase } from '../../services/supabase.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

const STYLES = `
  .crm-wrap { margin-top: 14px; }
  .crm-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
  .crm-select {
    height:36px; padding:0 12px; border-radius:9px; border:1px solid var(--ink-200);
    background:var(--ink-0); color:var(--ink-900); font-size:13px; min-width:220px;
  }
  /* crm-board and crm-col replaced with Tailwind classes */
  .crm-col.drag-over { border-color:var(--brand-500,#FF6A3D); box-shadow:0 0 0 2px rgba(255,106,61,.18) inset; }
  .crm-col__head {
    display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--ink-200);
  }
  .crm-col__dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .crm-col__title { font-size:13px; font-weight:600; color:var(--ink-900); flex:1; }
  .crm-col__count {
    font-size:11px; font-weight:600; color:var(--ink-500); background:var(--ink-100,#EEF0F3);
    border-radius:20px; padding:2px 8px;
  }
  .crm-col__body { padding:10px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px; }
  .crm-card {
    background:var(--ink-0); border:1px solid var(--ink-200); border-radius:11px; padding:11px 12px;
    cursor:grab; transition:border-color .12s, box-shadow .12s;
  }
  .crm-card:hover { border-color:var(--brand-500,#FF6A3D); box-shadow:0 2px 8px rgba(0,0,0,.06); }
  .crm-card:active { cursor:grabbing; }
  .crm-card.dragging { opacity:.45; }
  .crm-card__top { display:flex; align-items:center; gap:8px; }
  .crm-card__avatar {
    width:30px; height:30px; border-radius:50%; flex-shrink:0; background:var(--brand-500,#FF6A3D);
    color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600;
    object-fit:cover; overflow:hidden;
  }
  .crm-card__name { font-size:13px; font-weight:600; color:var(--ink-900); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .crm-card__msg { font-size:12px; color:var(--ink-500); margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .crm-card__tags { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
  .crm-tag { font-size:10px; font-weight:600; color:var(--brand-600,#E0531F); background:rgba(255,106,61,.10); border-radius:20px; padding:2px 7px; }
  .crm-drawer__field { margin-bottom:14px; }
  .crm-drawer__label { font-size:12px; font-weight:600; color:var(--ink-600); margin-bottom:5px; display:block; }
  .crm-drawer__value { font-size:13px; color:var(--ink-900); }
  .crm-loading, .crm-empty-wrap { padding:48px; text-align:center; color:var(--ink-500); font-size:14px; }
`;

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

const STAGES = [
  { id: 'NEW', name: 'Novo', color: '#3B82F6' },
  { id: 'QUALIFIED', name: 'Qualificado', color: '#8B5CF6' },
  { id: 'PROPOSAL', name: 'Proposta', color: '#F59E0B' },
  { id: 'WON', name: 'Ganho', color: '#10B981' },
  { id: 'LOST', name: 'Perdido', color: '#EF4444' }
];

export default function Crm() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  const [selected, setSelected] = useState(null); // card aberto no drawer
  const [savingLead, setSavingLead] = useState(false);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [error, setError] = useState('');
  const dragRef = useRef(null); // { opportunityId, fromStatus }

  // Carregar instâncias
  const { data: instancesData } = useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const d = await inboxApi.listInstances();
      const list = d.instances || [];
      const allRows = [{ key: 'all', id: 'all', name: 'Todas as Instâncias', status: 'connected', phone: '' }, ...list];
      return allRows;
    }
  });

  const instances = instancesData || [];
  
  const savedKey = localStorage.getItem('uazapi_crm_lastInstance');
  const targetKey = savedKey && instances.find(r => (r.key || r.id) === savedKey) ? savedKey : 'all';
  const instanceKey = targetKey;

  const changeInstance = (key) => {
    localStorage.setItem('uazapi_crm_lastInstance', key);
    queryClient.invalidateQueries({ queryKey: ['instances'] }); // força re-render para atualizar o estado
  };


  // Carregar Pipeline
  const { data: opps, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['pipeline', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_opportunities')
        .select(`
          id, stage, title, amount,
          lead:lead_id ( id, name, phone, email, tags )
        `)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const columns = useMemo(() => {
    if (!opps) return STAGES.map(s => ({ ...s, lead_status: s.id, cards: [] }));
    return STAGES.map(s => ({
      id: s.id,
      name: s.name,
      color: s.color,
      lead_status: s.id,
      cards: opps.filter(o => o.stage === s.id).map(o => ({
        opportunityId: o.id,
        chatId: o.lead?.phone ? `${o.lead.phone}@s.whatsapp.net` : `tmp-${o.id}`,
        leadId: o.lead?.id,
        name: o.lead?.name || o.lead?.phone || 'Sem Nome',
        phone: o.lead?.phone,
        email: o.lead?.email,
        tags: o.lead?.tags || [],
        title: o.title,
        amount: o.amount,
        avatar: null
      }))
    }));
  }, [opps]);

  const errorMsg = error || queryError?.message || '';

  // ── Drag-and-drop ──
  const onDragStart = (card, fromStatus) => (e) => {
    dragRef.current = { opportunityId: card.opportunityId, fromStatus };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', card.opportunityId); } catch { /* noop */ }
  };

  const moveCardMutation = useMutation({
    mutationFn: async ({ id, stage }) => {
      const { error } = await supabase.from('crm_opportunities').update({ stage }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['pipeline', tenantId] });
      const previousOpps = queryClient.getQueryData(['pipeline', tenantId]);
      queryClient.setQueryData(['pipeline', tenantId], old => 
        old?.map(o => o.id === id ? { ...o, stage } : o)
      );
      return { previousOpps };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['pipeline', tenantId], context.previousOpps);
      alert(`Falha ao mover: ${err.message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', tenantId] });
    }
  });

  const onDropColumn = (targetStage) => async (e) => {
    e.preventDefault();
    setDragOverCol(null);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.fromStatus === targetStage.lead_status) return;

    moveCardMutation.mutate({ id: drag.opportunityId, stage: targetStage.lead_status });
  };

  const saveLead = async (patch) => {
    if (!selected) return;
    setSavingLead(true);
    try {
      const { error } = await supabase
        .from('crm_leads')
        .update({
          name: patch.lead_name,
          email: patch.lead_email,
          tags: patch.lead_tags,
          notes: patch.lead_notes
        })
        .eq('id', selected.leadId);
        
      if (error) throw error;
      
      setSelected((s) => ({ ...s, ...mapPatchToCard(patch) }));
      queryClient.invalidateQueries({ queryKey: ['pipeline', tenantId] });
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingLead(false);
    }
  };

  return (
    <div className="crm-wrap">
      <style>{STYLES}</style>
      <PageHeader
        title="CRM"
        sub="Funil de vendas — arraste os leads entre as etapas"
      />

      <div className="crm-toolbar">
        <select
          className="crm-select"
          value={instanceKey}
          onChange={(e) => changeInstance(e.target.value)}
        >
          {instances.length === 0 && <option value="">Nenhuma instância</option>}
          {instances.map((i) => (
            <option key={i.key || i.id} value={i.key || i.id}>
              {i.name || i.phone || i.key} {i.id === 'all' ? '🌐' : (i.status === 'connected' ? '🟢' : '⚪')}
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['pipeline', tenantId] })} disabled={loading || !instanceKey}>
          Atualizar
        </Button>
        {errorMsg && <span style={{ color: '#EF4444', fontSize: 12 }}>{errorMsg}</span>}
      </div>

      {loading ? (
        <div className="crm-board">
          {STAGES.map((s) => (
            <div key={s.id} className="crm-col">
              <div className="crm-col__head">
                <span className="crm-col__dot" style={{ background: s.color }} />
                <span className="crm-col__title">{s.name}</span>
                <Skeleton w={20} h={14} style={{ borderRadius: 20 }} />
              </div>
              <div className="crm-col__body">
                <div className="crm-card"><Skeleton h={30} w={30} style={{ borderRadius: '50%', float: 'left', marginRight: 8 }} /><Skeleton h={14} w="60%" /><Skeleton h={10} w="40%" style={{ marginTop: 6 }} /></div>
                <div className="crm-card"><Skeleton h={30} w={30} style={{ borderRadius: '50%', float: 'left', marginRight: 8 }} /><Skeleton h={14} w="80%" /><Skeleton h={10} w="50%" style={{ marginTop: 6 }} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : !instanceKey ? (
        <div className="crm-empty-wrap">
          <EmptyState title="Sem instância conectada" text="Conecte um número WhatsApp para ver seus leads." />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3 min-h-[calc(100vh-230px)] items-start">
          {columns.map((col) => (
            <div
              key={col.id}
              className={`flex-none w-72 bg-gray-50 border border-gray-200 rounded-xl flex flex-col max-h-[calc(100vh-230px)] crm-col ${dragOverCol === col.id ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={onDropColumn(col)}
            >
              <div className="crm-col__head">
                <span className="crm-col__dot" style={{ background: col.color || '#FF6A3D' }} />
                <span className="crm-col__title">{col.name}</span>
                <span className="crm-col__count">{col.cards.length}</span>
              </div>
              <div className="crm-col__body">
                {col.cards.map((card) => (
                  <div
                    key={card.chatId}
                    className="crm-card"
                    draggable
                    onDragStart={onDragStart(card, col.lead_status)}
                    onDragEnd={() => setDragOverCol(null)}
                    onClick={() => setSelected(card)}
                  >
                    <div className="crm-card__top">
                      <span className="crm-card__avatar">
                        {card.avatar
                          ? <img src={card.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(card.name)}
                      </span>
                      <span className="crm-card__name">{card.name}</span>
                    </div>
                    {instanceKey === 'all' && card._sourceInstance && (
                      <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 4 }}>
                        Conexão: {instances.find(i => i.key === card._sourceInstance)?.name || card._sourceInstance}
                      </div>
                    )}
                    {card.lastMessage && <div className="crm-card__msg">{card.lastMessage}</div>}
                    {card.tags?.length > 0 && (
                      <div className="crm-card__tags">
                        {card.tags.slice(0, 3).map((t) => <span key={t} className="crm-tag">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
                {col.cards.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', textAlign: 'center', padding: '18px 0' }}>
                    Sem leads
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer de detalhes do lead — renderizado só quando há card selecionado */}
      {selected && (
        <Drawer onClose={() => setSelected(null)} title={selected.name || 'Lead'}>
          <LeadDetails key={selected.chatId} card={selected} onSave={saveLead} saving={savingLead} />
        </Drawer>
      )}
    </div>
  );
}

function mapPatchToCard(patch) {
  const out = {};
  if (patch.lead_name !== undefined) out.name = patch.lead_name;
  if (patch.lead_tags !== undefined) out.tags = patch.lead_tags;
  if (patch.lead_notes !== undefined) out.notes = patch.lead_notes;
  if (patch.lead_email !== undefined) out.email = patch.lead_email;
  return out;
}

function LeadDetails({ card, onSave, saving }) {
  // Inicializa a partir do card. O componente é remontado via key={card.chatId}
  // no pai sempre que outro card é aberto, então não precisa de effect de sync.
  const [name, setName] = useState(card.name || '');
  const [email, setEmail] = useState(card.email || '');
  const [notes, setNotes] = useState(card.notes || '');
  const [tagsText, setTagsText] = useState((card.tags || []).join(', '));

  const save = () => {
    const lead_tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    onSave({ lead_name: name, lead_email: email, lead_notes: notes, lead_tags });
  };

  return (
    <div>
      <div className="crm-drawer__field">
        <span className="crm-drawer__label">Telefone</span>
        <div className="crm-drawer__value">{card.phone || '—'}</div>
      </div>
      <div className="crm-drawer__field">
        <span className="crm-drawer__label">Nome</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do lead" />
      </div>
      <div className="crm-drawer__field">
        <span className="crm-drawer__label">E-mail</span>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
      </div>
      <div className="crm-drawer__field">
        <span className="crm-drawer__label">Tags (separadas por vírgula)</span>
        <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="vip, quente" />
      </div>
      <div className="crm-drawer__field">
        <span className="crm-drawer__label">Anotações</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          style={{
            width: '100%', borderRadius: 9, border: '1px solid var(--ink-200)',
            padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            background: 'var(--ink-0)', color: 'var(--ink-900)',
          }}
          placeholder="Notas sobre o lead…"
        />
      </div>
      {card.lastMessage && (
        <div className="crm-drawer__field">
          <span className="crm-drawer__label">Última mensagem</span>
          <div className="crm-drawer__value" style={{ color: 'var(--ink-500)' }}>{card.lastMessage}</div>
        </div>
      )}
      <Button onClick={save} disabled={saving} style={{ width: '100%', marginTop: 8 }}>
        {saving ? 'Salvando…' : 'Salvar lead'}
      </Button>
    </div>
  );
}
