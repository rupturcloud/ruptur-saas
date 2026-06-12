/**
 * Admin.jsx — Configurações da plataforma
 * Abas: Usuários e papéis · Workspace · Conta · Cobrança · Notificações
 *       Privacidade & LGPD · Conectores · Permissões · Instâncias uazapi · Webhooks
 *
 * Abas funcionais (API real):
 *   - Conectores: mostra integrações ativas / disponíveis
 *   - Instâncias uazapi: CRUD de provider_accounts (/api/admin/provider-accounts)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PageHeader, Button, Modal, Input, Icon,
} from '../../ds/index.js';
import { useToast } from '../../ds/toast.js';
import { providerApi } from '../../api/admin.api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../services/supabase.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const KIND_LABEL = { free: 'Free', paid: 'Pago', dedicated: 'Dedicado', internal: 'Interno' };
const STATUS_LABEL = { active: 'Ativo', capacity_full: 'Capacidade cheia', draining: 'Drenando', disabled: 'Desabilitado', expired: 'Expirado' };
const STATUS_COLOR = { active: '#22c55e', capacity_full: '#f59e0b', draining: '#f59e0b', disabled: '#6b7280', expired: '#ef4444' };

function dot(color) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7,
      borderRadius: '50%', background: color, marginRight: 6, flexShrink: 0,
    }} />
  );
}

// ─── Aba: Usuários e papéis ───────────────────────────────────────────────────

const ROLE_OPTS = ['owner', 'admin', 'member'];
const ROLE_STYLE = {
  owner:  { bg: 'var(--brand-50)',  color: 'var(--brand-600)' },
  admin:  { bg: 'rgba(99,102,241,.1)', color: '#818CF8' },
  member: { bg: 'var(--ink-100)',   color: 'var(--ink-500)' },
};

function RolePill({ role }) {
  const s = ROLE_STYLE[role] || ROLE_STYLE.member;
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: '.02em',
    }}>
      {role}
    </span>
  );
}

function UsersTab() {
  // tenant vem do AuthContext — já carregado no login, não precisa de chamada extra
  const { session, tenant, isPlatformAdmin } = useAuth();
  const h = { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };

  const [allTenants, setAllTenants] = useState([]);   // só super admin vê todos
  const [selectedId, setSelectedId] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionState, setActionState] = useState({});
  const [roleOpen, setRoleOpen] = useState(null);
  const [loadError, setLoadError] = useState(null);   // erro do fetch de membros (diagnóstico)
  const [inviteOpen, setInviteOpen] = useState(false);   // painel de convite (CREATE)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteState, setInviteState] = useState(null);  // null | 'saving' | 'ok' | 'err:...'

  // Selecionar tenant inicial a partir do AuthContext (sem chamar API)
  useEffect(() => {
    if (tenant?.id) setSelectedId((prev) => prev || tenant.id);
  }, [tenant?.id]);

  // Super admins: buscar todos os tenants para o selector
  useEffect(() => {
    if (!isPlatformAdmin || !session?.access_token) return;
    fetch('/api/admin/platform/tenants', { headers: h })
      .then(r => r.ok ? r.json() : { tenants: [] })
      .then(d => setAllTenants(d.tenants || []));
  }, [isPlatformAdmin, session?.access_token]);

  // FALLBACK CRÍTICO: super admin SEM membership própria não recebe tenant do
  // AuthContext → selectedId ficava null → a lista NUNCA carregava (vazio
  // permanente). Aqui selecionamos o primeiro tenant disponível assim que a
  // lista de tenants da plataforma chega.
  useEffect(() => {
    if (!selectedId && allTenants.length > 0) setSelectedId(allTenants[0].id);
  }, [selectedId, allTenants]);

  // Carregar membros do tenant selecionado
  const loadMembers = useCallback(() => {
    if (!selectedId || !session?.access_token) return;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/admin/tenants/${selectedId}/members?includeInactive=true`, { headers: h })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Erro ${r.status} ao carregar membros`);
        }
        return r.json();
      })
      .then(d => setMembers(d.members || []))
      .catch((e) => { setMembers([]); setLoadError(e.message); })
      .finally(() => setLoading(false));
  }, [selectedId, session?.access_token]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const doAction = async (userId, url, body = null, method = 'POST') => {
    setActionState(s => ({ ...s, [userId]: 'saving' }));
    try {
      const opts = { method, headers: h };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      setActionState(s => ({ ...s, [userId]: 'ok' }));
      setTimeout(() => { setActionState(s => { const n = { ...s }; delete n[userId]; return n; }); loadMembers(); }, 1500);
    } catch (e) {
      setActionState(s => ({ ...s, [userId]: 'err:' + e.message }));
      setTimeout(() => setActionState(s => { const n = { ...s }; delete n[userId]; return n; }), 3000);
    }
  };

  const changeRole = (userId, role) => {
    setRoleOpen(null);
    doAction(userId, `/api/admin/tenants/${selectedId}/members/${userId}/role`, { role });
  };
  const confirmEmail  = (userId) => doAction(userId, `/api/admin/platform/users/${userId}/confirm-email`);
  const resetPassword = (userId) => doAction(userId, `/api/admin/platform/users/${userId}/reset-password`);

  // DELETE — remover membro do tenant (endpoint platform; a conta no Auth permanece)
  const removeMember = (userId, email) => {
    setRoleOpen(null);
    if (typeof window !== 'undefined' &&
        !window.confirm(`Remover ${email} deste tenant?\n\nO usuário perde o acesso a este workspace (a conta de login permanece).`)) return;
    doAction(userId, `/api/admin/platform/tenants/${selectedId}/members/${userId}`, null, 'DELETE');
  };

  // CREATE — convidar/adicionar membro (cria no Auth se não existir + vincula ao tenant)
  const addMember = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setInviteState('err:Informe um e-mail válido'); return; }
    if (!selectedId) { setInviteState('err:Nenhum tenant selecionado'); return; }
    setInviteState('saving');
    try {
      const res = await fetch(`/api/admin/platform/tenants/${selectedId}/members`, {
        method: 'POST', headers: h, body: JSON.stringify({ email, role: inviteRole }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      setInviteState('ok');
      setInviteEmail('');
      setTimeout(() => { setInviteState(null); setInviteOpen(false); loadMembers(); }, 1000);
    } catch (e) {
      setInviteState('err:' + e.message);
    }
  };

  // Nome do tenant exibido
  const displayTenant = allTenants.find(t => t.id === selectedId) || tenant;

  return (
    <div>
      {/* Status bar: tenant ativo + nível de acesso */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderRadius: 10, marginBottom: 18,
        background: 'var(--ink-50)', border: '1px solid var(--ink-150)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Tenant ativo:</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-900)' }}>
            {displayTenant?.name || 'Carregando...'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>({displayTenant?.slug || displayTenant?.id?.slice(0,8)})</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Role no tenant */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Papel:</span>
            <RolePill role={tenant?.userRole || 'member'} />
          </div>
          {/* Badge super admin */}
          {isPlatformAdmin && (
            <span style={{
              padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: 'rgba(99,102,241,.12)', color: '#818CF8',
              border: '1px solid rgba(99,102,241,.25)',
            }}>
              ⚡ Super Admin
            </span>
          )}
          <button
            onClick={loadMembers}
            style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--ink-200)', background: '#fff', cursor: 'pointer', fontSize: 12, color: 'var(--ink-600)' }}
          >
            ↻ Atualizar
          </button>
        </div>
      </div>

      {/* Header da lista */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 15 }}>
          Equipe · {loading ? '...' : members.length} membro{members.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => { setInviteOpen(o => !o); setInviteState(null); }}
          disabled={!selectedId}
          style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', cursor: selectedId ? 'pointer' : 'not-allowed',
            background: 'var(--brand-500)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: selectedId ? 1 : 0.5,
          }}
        >
          {inviteOpen ? '✕ Cancelar' : '+ Adicionar membro'}
        </button>
      </div>

      {/* Painel de convite (CREATE) */}
      {inviteOpen && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
          padding: 14, marginBottom: 14, borderRadius: 10,
          background: 'var(--ink-50)', border: '1px solid var(--ink-150)',
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5 }}>E-mail do novo membro</label>
            <input
              type="email" value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteState(null); }}
              onKeyDown={e => e.key === 'Enter' && addMember()}
              placeholder="pessoa@empresa.com" autoFocus
              style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--ink-200)', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5 }}>Papel</label>
            <select
              value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--ink-200)', fontSize: 13, background: '#fff' }}
            >
              {ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button
            onClick={addMember} disabled={inviteState === 'saving'}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--brand-500)', color: '#fff', fontSize: 13, fontWeight: 600,
              opacity: inviteState === 'saving' ? 0.6 : 1,
            }}
          >
            {inviteState === 'saving' ? 'Adicionando...' : 'Adicionar'}
          </button>
          {inviteState === 'ok' && <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>✓ Adicionado</span>}
          {inviteState?.startsWith('err:') && <span style={{ color: '#ef4444', fontSize: 12 }}>{inviteState.slice(4)}</span>}
        </div>
      )}

      {/* Selector de tenant (só super admin vê todos) */}
      {isPlatformAdmin && allTenants.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {allTenants.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedId === t.id ? 'var(--brand-500)' : 'var(--ink-100)',
                color: selectedId === t.id ? '#fff' : 'var(--ink-600)',
                border: `1px solid ${selectedId === t.id ? 'var(--brand-500)' : 'var(--ink-200)'}`,
              }}
            >
              {t.name || t.slug}
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      <div style={{ border: '1px solid var(--ink-150)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--ink-50)' }}>
              {['MEMBRO', 'ROLE', 'E-MAIL', 'STATUS', 'AÇÕES'].map(col => (
                <th key={col} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--ink-500)', letterSpacing: '.04em' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Carregando...</td></tr>
            )}
            {!loading && loadError && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#dc2626' }}>
                ⚠️ {loadError}
              </td></tr>
            )}
            {!loading && !loadError && !selectedId && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>
                {isPlatformAdmin
                  ? 'Super admin sem tenants na plataforma — verifique a tabela platform_admins/tenants.'
                  : 'Nenhum tenant vinculado ao seu usuário. Faça login com um usuário que tenha acesso.'}
              </td></tr>
            )}
            {!loading && !loadError && selectedId && members.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Nenhum membro neste tenant.</td></tr>
            )}
            {!loading && members.map((m, i) => {
              const state = actionState[m.user_id];
              const saving = state === 'saving';
              const ok = state === 'ok';
              const err = state?.startsWith?.('err:') ? state.slice(4) : null;
              return (
                <tr key={m.user_id} style={{ borderTop: i > 0 ? '1px solid var(--ink-100)' : 'none' }}>
                  {/* Nome */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--brand-100)', color: 'var(--brand-600)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 12, flexShrink: 0,
                      }}>
                        {(m.full_name || m.email || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{m.full_name || m.email?.split('@')[0]}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{m.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Role com dropdown */}
                  <td style={{ padding: '12px 16px', position: 'relative' }}>
                    <button
                      onClick={() => setRoleOpen(roleOpen === m.user_id ? null : m.user_id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <RolePill role={m.role} />
                      <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>▾</span>
                    </button>
                    {roleOpen === m.user_id && (
                      <div style={{
                        position: 'absolute', top: '110%', left: 0, zIndex: 50,
                        background: '#fff', border: '1px solid var(--ink-200)', borderRadius: 8,
                        padding: 6, minWidth: 110, boxShadow: '0 8px 20px rgba(0,0,0,.1)',
                      }}>
                        {ROLE_OPTS.filter(r => r !== m.role).map(r => (
                          <button
                            key={r}
                            onClick={() => changeRole(m.user_id, r)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-50)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >
                            <RolePill role={r} />
                          </button>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* E-mail */}
                  <td style={{ padding: '12px 16px', color: 'var(--ink-500)', fontSize: 12 }}>{m.email}</td>

                  {/* Status e-mail */}
                  <td style={{ padding: '12px 16px' }}>
                    {m.email_confirmed
                      ? <span style={{ display: 'flex', alignItems: 'center', color: '#22c55e', fontWeight: 500 }}>{dot('#22c55e')}Confirmado</span>
                      : <span style={{ display: 'flex', alignItems: 'center', color: '#f59e0b', fontWeight: 500 }}>{dot('#f59e0b')}Pendente</span>
                    }
                  </td>

                  {/* Ações */}
                  <td style={{ padding: '12px 16px' }}>
                    {saving && <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>Salvando...</span>}
                    {ok    && <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>✓ Salvo</span>}
                    {err   && <span style={{ color: '#ef4444', fontSize: 11 }}>{err}</span>}
                    {!saving && !ok && !err && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!m.email_confirmed && (
                          <button
                            onClick={() => confirmEmail(m.user_id)}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: '1px solid #f59e0b',
                              background: 'rgba(245,158,11,.08)', color: '#b45309', fontSize: 11,
                              fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            Confirmar e-mail
                          </button>
                        )}
                        <button
                          onClick={() => resetPassword(m.user_id)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid var(--ink-200)',
                            background: 'var(--ink-50)', color: 'var(--ink-600)', fontSize: 11,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Reset senha
                        </button>
                        <button
                          onClick={() => removeMember(m.user_id, m.email)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca',
                            background: 'rgba(239,68,68,.06)', color: '#dc2626', fontSize: 11,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Aba: Conectores ──────────────────────────────────────────────────────────

const STATIC_CONNECTORS = [
  {
    id: 'getnet',
    name: 'Getnet',
    desc: 'Gateway de pagamento — PIX, Boleto, Cartão. Integrado ao módulo de billing.',
    icon: 'billing',
    connected: true,
    badge: 'Ativo',
    badgeColor: '#22c55e',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    desc: 'Banco de dados e autenticação da plataforma.',
    icon: 'shield',
    connected: true,
    badge: 'Ativo',
    badgeColor: '#22c55e',
  },
  {
    id: 'crm',
    name: 'CRM Externo',
    desc: 'Integre com HubSpot, Salesforce, Pipedrive ou qualquer CRM via webhook.',
    icon: 'pipeline',
    connected: false,
    badge: 'Disponível',
    badgeColor: '#6b7280',
  },
  {
    id: 'openai',
    name: 'OpenAI / GPT-4',
    desc: 'IA para geração de mensagens, playbooks e análise de conversas.',
    icon: 'sparkles',
    connected: false,
    badge: 'Disponível',
    badgeColor: '#6b7280',
  },
];

function ConnectorsTab() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await providerApi.listAccounts();
      setAccounts(result.accounts || []);
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) {
        toast({ type: 'error', title: e.message || 'Erro ao carregar contas UAZAPI.' });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const totalInstances = accounts.reduce((s, a) => s + Number(a.used_instances || 0), 0);
  const freeAccounts   = accounts.filter(a => a.account_kind === 'free');
  const paidAccounts   = accounts.filter(a => ['paid', 'dedicated'].includes(a.account_kind));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Seção UAZAPI WhatsApp ─────────────────────────────────────────── */}
      <div>
        {/* Cabeçalho da seção */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: accounts.length > 0 ? 'var(--brand-50)' : 'var(--ink-100)',
            color: accounts.length > 0 ? 'var(--brand-500)' : 'var(--ink-400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="wa" size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>UAZAPI WhatsApp</span>
              {!loading && accounts.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                  background: '#dcfce7', color: '#16a34a',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {dot('#22c55e')}
                  {accounts.length} conta{accounts.length > 1 ? 's' : ''} · {totalInstances} instância{totalInstances !== 1 ? 's' : ''}
                  {freeAccounts.length > 0 && paidAccounts.length > 0 && ` · Free + Pago`}
                </span>
              )}
              {!loading && accounts.length === 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                  background: 'var(--ink-100)', color: 'var(--ink-500)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {dot('#6b7280')}Não configurado
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
              API WhatsApp multi-conta — free (1h) e pago (persistente). Rotação automática entre contas.
            </div>
          </div>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setAddOpen(true)}>
            Adicionar conta
          </Button>
        </div>

        {/* Lista de contas com CRUD completo */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2].map(i => (
              <div key={i} style={{
                height: 140, border: '1px solid var(--ink-150)', borderRadius: 12,
                background: 'var(--ink-50)', animation: 'pulse 1.4s infinite',
              }} />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px 20px',
            border: '1px dashed var(--ink-200)', borderRadius: 12,
            color: 'var(--ink-400)',
          }}>
            <Icon name="wa" size={28} />
            <div style={{ marginTop: 10, fontWeight: 600, color: 'var(--ink-600)' }}>
              Nenhuma conta UAZAPI configurada
            </div>
            <div style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              Adicione uma conta free ou paga para conectar números WhatsApp.
            </div>
            <Button variant="primary" icon="plus" size="sm" onClick={() => setAddOpen(true)}>
              Adicionar conta
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {accounts.map(a => (
              <AccountCard key={a.id} account={a} onRefresh={loadAccounts} />
            ))}
          </div>
        )}

        {/* Info box multi-conta */}
        {accounts.length > 0 && (
          <div style={{
            marginTop: 14, padding: '12px 16px', borderRadius: 10,
            background: 'var(--brand-25, #fff7f4)', border: '1px solid var(--brand-100)',
            fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.6,
          }}>
            <strong>Rotação multi-conta:</strong> Ao criar uma instância, o sistema escolhe automaticamente a conta com menor uso e com capacidade disponível — free ou pago conforme o tipo selecionado. Você pode ter N contas simultâneas de cada tipo.
          </div>
        )}
      </div>

      {/* ── Demais conectores ─────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 10, letterSpacing: '.04em' }}>
          OUTROS CONECTORES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STATIC_CONNECTORS.map(c => (
            <div key={c.id} style={{
              border: '1px solid var(--ink-150)', borderRadius: 10,
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 16,
              background: c.connected ? 'var(--ink-0)' : 'var(--ink-25, #fafafa)',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: c.connected ? 'var(--brand-50)' : 'var(--ink-100)',
                color: c.connected ? 'var(--brand-500)' : 'var(--ink-400)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name={c.icon} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 14 }}>{c.name}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: c.connected ? '#dcfce7' : 'var(--ink-100)',
                    color: c.badgeColor,
                  }}>
                    {dot(c.badgeColor)}{c.badge}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>{c.desc}</p>
              </div>
              {c.connected ? (
                <Button variant="ghost" size="sm">Configurar</Button>
              ) : (
                <Button variant="secondary" size="sm" icon="plus">Conectar</Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {addOpen && (
        <AddAccountModal onClose={() => setAddOpen(false)} onSaved={loadAccounts} />
      )}
    </div>
  );
}

// ─── Aba: Instâncias UAZAPI ────────────────────────────────────────────────────

function AddAccountModal({ onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    label: '', serverUrl: 'https://free.uazapi.com',
    adminToken: '', accountKind: 'free', capacityInstances: 1,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.label.trim()) { toast({ type: 'error', title: 'Informe um nome para a conta.' }); return; }
    if (!form.adminToken.trim()) { toast({ type: 'error', title: 'Token de admin obrigatório.' }); return; }
    setSaving(true);
    try {
      const result = await providerApi.createAccount({
        label: form.label.trim(),
        serverUrl: form.serverUrl.trim() || 'https://free.uazapi.com',
        adminToken: form.adminToken.trim(),
        accountKind: form.accountKind,
        capacityInstances: Number(form.capacityInstances) || 1,
      });
      toast({ type: 'success', title: '✓ Conta UAZAPI adicionada!', message: 'Clique em Sincronizar para verificar a conexão.' });
      onSaved(result?.account?.id);
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e.message || 'Erro ao salvar conta.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Adicionar conta UAZAPI" onClose={onClose} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>
            NOME DA CONTA
          </label>
          <Input
            placeholder="Ex: UAZAPI Free — Ruptur"
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>
            TIPO
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['free', 'paid', 'dedicated'].map(k => (
              <button
                key={k}
                onClick={() => set('accountKind', k)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid',
                  borderColor: form.accountKind === k ? 'var(--brand-500)' : 'var(--ink-150)',
                  background: form.accountKind === k ? 'var(--brand-50)' : 'var(--ink-0)',
                  color: form.accountKind === k ? 'var(--brand-600)' : 'var(--ink-600)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>
            URL DO SERVIDOR
          </label>
          <Input
            placeholder="https://free.uazapi.com"
            value={form.serverUrl}
            onChange={e => set('serverUrl', e.target.value)}
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>
            Servidor free: https://free.uazapi.com · Pago: URL do seu servidor UAZAPI
          </p>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>
            TOKEN DE ADMIN
          </label>
          <Input
            type="password"
            placeholder="Token gerado no painel UAZAPI"
            value={form.adminToken}
            onChange={e => set('adminToken', e.target.value)}
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>
            Nunca exposto no frontend — armazenado criptografado (AES-256-GCM).
          </p>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>
            CAPACIDADE (instâncias)
          </label>
          <Input
            type="number"
            min={1}
            placeholder="Ex: 100"
            value={form.capacityInstances}
            onChange={e => set('capacityInstances', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Adicionar conta'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: Editar conta UAZAPI ───────────────────────────────────────────────

function EditAccountModal({ account, onClose, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    label: account.label || '',
    serverUrl: account.server_url || 'https://free.uazapi.com',
    accountKind: account.account_kind || 'free',
    capacityInstances: String(account.capacity_instances ?? 1),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.label.trim()) { toast({ type: 'error', title: 'Informe um nome para a conta.' }); return; }
    setSaving(true);
    try {
      await providerApi.updateAccount(account.id, {
        label: form.label.trim(),
        serverUrl: form.serverUrl.trim() || 'https://free.uazapi.com',
        accountKind: form.accountKind,
        capacityInstances: Number(form.capacityInstances) || 1,
      });
      toast({ type: 'success', title: 'Conta atualizada.' });
      onSaved?.();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar conta UAZAPI" onClose={onClose} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Nome / label" value={form.label} onChange={e => set('label', e.target.value)} placeholder="Ex: UAZAPI Free Principal" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-700)', marginBottom: 8 }}>Tipo</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <button key={k} type="button" onClick={() => set('accountKind', k)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${form.accountKind === k ? 'var(--brand-500)' : 'var(--ink-150)'}`,
                background: form.accountKind === k ? 'var(--brand-50)' : 'var(--ink-0)',
                color: form.accountKind === k ? 'var(--brand-600)' : 'var(--ink-600)',
              }}>{label}</button>
            ))}
          </div>
        </div>
        <Input label="Server URL" value={form.serverUrl} onChange={e => set('serverUrl', e.target.value)} placeholder="https://free.uazapi.com" />
        <Input label="Capacidade (instâncias)" type="number" min={1} value={form.capacityInstances} onChange={e => set('capacityInstances', e.target.value)} placeholder="1" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: Rotacionar token ──────────────────────────────────────────────────

function RotateTokenModal({ account, onClose, onSaved }) {
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!token.trim()) { toast({ type: 'error', title: 'Informe o novo admin token.' }); return; }
    setSaving(true);
    try {
      await providerApi.rotateToken(account.id, token.trim());
      toast({ type: 'success', title: 'Token rotacionado com sucesso.' });
      onSaved?.();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e.message || 'Erro ao rotacionar token.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Rotacionar admin token" onClose={onClose} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: 'var(--brand-25, #fff7f4)',
          border: '1px solid var(--brand-100)', fontSize: 13, color: 'var(--ink-700)',
        }}>
          Token atual: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>···· {account.admin_token_last4 || '????'}</span>
        </div>
        <Input
          label="Novo admin token"
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Cole o novo token aqui"
          autoComplete="off"
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar rotação'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── AccountCard com CRUD completo ───────────────────────────────────────────

function AccountCard({ account, onRefresh, highlight }) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  const usedPct = account.capacity_instances > 0
    ? Math.min(100, Math.round((account.used_instances / account.capacity_instances) * 100))
    : 0;

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await providerApi.syncAccount(account.id);
      toast({ type: 'success', title: `Sync OK — ${result.upserted ?? '?'} instâncias sincronizadas.` });
      onRefresh?.();
    } catch (e) {
      toast({ type: 'error', title: e.message || 'Erro ao sincronizar.' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggle() {
    const next = account.status === 'active' ? 'disabled' : 'active';
    try {
      await providerApi.updateStatus(account.id, next);
      toast({ type: 'success', title: `Conta ${next === 'active' ? 'ativada' : 'desabilitada'}.` });
      onRefresh?.();
    } catch (e) {
      toast({ type: 'error', title: e.message || 'Erro ao atualizar status.' });
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Excluir a conta "${account.label}"?\n\nEssa ação é irreversível. Certifique-se de que não há instâncias ativas.`)) return;
    setDeleting(true);
    try {
      await providerApi.deleteAccount(account.id);
      toast({ type: 'success', title: `Conta "${account.label}" excluída.` });
      onRefresh?.();
    } catch (e) {
      toast({ type: 'error', title: e.message || 'Erro ao excluir.' });
    } finally {
      setDeleting(false);
    }
  }

  const statusColor = STATUS_COLOR[account.status] || '#6b7280';
  const kindIsPaid = ['paid', 'dedicated'].includes(account.account_kind);

  return (
    <div style={{
      border: highlight ? '2px solid #22c55e' : '1px solid var(--ink-150)',
      boxShadow: highlight ? '0 0 0 3px rgba(34,197,94,0.12)' : 'none',
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      background: account.status === 'disabled' ? 'var(--ink-25, #fafafa)' : 'var(--ink-0)',
      transition: 'border-color .4s, box-shadow .4s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: kindIsPaid ? 'var(--brand-50)' : 'var(--ink-100)',
          color: kindIsPaid ? 'var(--brand-500)' : 'var(--ink-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="wa" size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--ink-900)', fontSize: 14 }}>{account.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: kindIsPaid ? 'var(--brand-50)' : 'var(--ink-100)',
              color: kindIsPaid ? 'var(--brand-600)' : 'var(--ink-500)',
            }}>
              {KIND_LABEL[account.account_kind] || account.account_kind}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{account.server_url}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: statusColor, flexShrink: 0 }}>
          {dot(statusColor)}{STATUS_LABEL[account.status] || account.status}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 24, fontSize: 13, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 2 }}>INSTÂNCIAS</div>
          <div style={{ fontWeight: 700, color: 'var(--ink-900)' }}>
            {account.used_instances} / {account.capacity_instances > 0 ? account.capacity_instances : '∞'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 2 }}>ADMIN TOKEN</div>
          <div style={{ fontWeight: 500, color: 'var(--ink-600)', fontFamily: 'monospace', fontSize: 13 }}>
            ···· {account.admin_token_last4 || '????'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 2 }}>ROTAÇÃO</div>
          <div style={{ fontWeight: 500, color: 'var(--ink-600)', fontSize: 13 }}>
            {account.rotation_policy?.mode === 'manual' ? 'Manual' :
              account.rotation_policy?.mode === 'round_robin' ? 'Round-robin' :
              account.rotation_policy?.mode || 'Manual'}
          </div>
        </div>
        {account.expires_at && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 2 }}>EXPIRA</div>
            <div style={{ fontWeight: 500, color: '#f59e0b', fontSize: 13 }}>
              {new Date(account.expires_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
        )}
      </div>

      {/* Capacity bar */}
      {account.capacity_instances > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-400)', marginBottom: 4 }}>
            <span>Capacidade utilizada</span>
            <span style={{ fontWeight: 600, color: usedPct > 90 ? '#ef4444' : usedPct > 70 ? '#f59e0b' : 'var(--ink-500)' }}>{usedPct}%</span>
          </div>
          <div style={{ height: 5, background: 'var(--ink-100)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${usedPct}%`,
              background: usedPct > 90 ? '#ef4444' : usedPct > 70 ? '#f59e0b' : 'var(--brand-500)',
              transition: 'width .4s',
            }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="secondary" size="sm" icon="sparkles" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Sincronizando…' : 'Sincronizar'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={() => setRotateOpen(true)}>Rotacionar token</Button>
        <Button variant="ghost" size="sm" onClick={handleToggle}>
          {account.status === 'active' ? 'Desabilitar' : 'Ativar'}
        </Button>
        {/* Excluir — alinhado à direita */}
        <div style={{ marginLeft: 'auto' }}>
          <Button
            variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
            style={{ color: '#ef4444' }}
          >
            {deleting ? 'Excluindo…' : 'Excluir'}
          </Button>
        </div>
      </div>

      {editOpen && (
        <EditAccountModal account={account} onClose={() => setEditOpen(false)} onSaved={onRefresh} />
      )}
      {rotateOpen && (
        <RotateTokenModal account={account} onClose={() => setRotateOpen(false)} onSaved={onRefresh} />
      )}
    </div>
  );
}

function UazapiTab() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [lastAddedId, setLastAddedId] = useState(null);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await providerApi.listAccounts();
      setAccounts(result.accounts || []);
    } catch (e) {
      if (e.status === 503) {
        toast({ type: 'error', title: 'Migration pendente', message: e.message });
      } else if (e.status === 401 || e.status === 403) {
        toast({ type: 'error', title: 'Acesso restrito a admins da plataforma.' });
      } else {
        toast({ type: 'error', title: e.message || 'Erro ao carregar contas.' });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Destaca o card recém-adicionado e rola até ele
  function handleAdded(newId) {
    load().then(() => {
      if (newId) {
        setLastAddedId(newId);
        setTimeout(() => setLastAddedId(null), 4000);
        // scroll suave até o novo card
        requestAnimationFrame(() => {
          const el = document.getElementById(`uazapi-card-${newId}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    });
  }

  const hasAccounts = accounts.length > 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 15 }}>Contas UAZAPI</div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
            Gerencie servidores WhatsApp — free (1h) e pagos (persistentes).
            {hasAccounts && (
              <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--brand-500)' }}>
                {accounts.length} conta{accounts.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <Button
          variant={hasAccounts ? 'secondary' : 'primary'}
          icon="plus"
          size="sm"
          onClick={() => setAddOpen(true)}
        >
          {hasAccounts ? 'Nova conta' : 'Adicionar conta'}
        </Button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => (
            <div key={i} style={{
              height: 160, border: '1px solid var(--ink-150)', borderRadius: 12,
              background: 'var(--ink-50)', animation: 'pulse 1.4s infinite',
            }} />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          border: '1px dashed var(--ink-200)', borderRadius: 12,
          color: 'var(--ink-400)',
        }}>
          <Icon name="wa" size={32} />
          <div style={{ marginTop: 12, fontWeight: 600, color: 'var(--ink-600)' }}>Nenhuma conta UAZAPI</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Adicione uma conta free ou paga para gerenciar números WhatsApp.
          </div>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
              Adicionar conta
            </Button>
          </div>
        </div>
      ) : (
        <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {accounts.map(a => (
            <div key={a.id} id={`uazapi-card-${a.id}`}>
              <AccountCard account={a} onRefresh={load} highlight={lastAddedId === a.id} />
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div style={{
        marginTop: 24, padding: '14px 16px', borderRadius: 10,
        background: 'var(--brand-25, #fff7f4)', border: '1px solid var(--brand-100)',
        fontSize: 13, color: 'var(--ink-700)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="alert" size={14} /> Modelo multi-conta
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Cada conta pode servir N tenants (plataforma gerencia o roteamento).</li>
          <li>Um tenant pode ter múltiplas contas atribuídas (free + paid, por exemplo).</li>
          <li>Free: instâncias expiram em 1h. Paid: persistentes.</li>
          <li>Token admin nunca é exibido no frontend — armazenado criptografado (AES-256-GCM).</li>
        </ul>
      </div>

      {addOpen && (
        <AddAccountModal
          onClose={() => setAddOpen(false)}
          onSaved={handleAdded}
        />
      )}
    </div>
  );
}

// ─── Aba: Webhooks ────────────────────────────────────────────────────────────

function WebhooksTab() {
  const endpoints = [
    { event: 'whatsapp.message.received', path: '/api/v1/webhooks/wa/message', group: 'WhatsApp (UAZAPI)' },
    { event: 'whatsapp.qr.updated',       path: '/api/v1/webhooks/wa/qr',      group: 'WhatsApp (UAZAPI)' },
    { event: 'whatsapp.status.changed',   path: '/api/v1/webhooks/wa/status',  group: 'WhatsApp (UAZAPI)' },
    { event: 'billing.payment.confirmed', path: '/api/v1/webhooks/getnet',     group: 'Billing (Getnet)' },
  ];
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ruptur.cloud';
  const [copied, setCopied] = useState(null);
  const copy = (url) => { navigator.clipboard?.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1500); };

  return (
    <div>
      <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 15, marginBottom: 6 }}>Webhooks de entrada</div>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
        URLs que os provedores externos chamam. Copie e configure no painel do UAZAPI / Getnet.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {endpoints.map(ep => {
          const full = origin + ep.path;
          return (
            <div key={ep.event} style={{ border: '1px solid var(--ink-150)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--ink-100)', color: 'var(--ink-600)' }}>{ep.group}</span>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-900)', flex: 1 }}>{ep.event}</div>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#22c55e' }}>{dot('#22c55e')}Ativo</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--ink-50)', borderRadius: 8, padding: '7px 10px' }}>
                <code style={{ flex: 1, fontSize: 12, color: 'var(--ink-700)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{full}</code>
                <button onClick={() => copy(full)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--ink-200)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: copied === full ? '#22c55e' : 'var(--ink-600)', whiteSpace: 'nowrap' }}>
                  {copied === full ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--ink-50)', border: '1px solid var(--ink-150)', fontSize: 12, color: 'var(--ink-600)' }}>
        Webhooks de <strong>entrada</strong> são fixos do sistema (recebem eventos dos provedores). Webhooks de <strong>saída</strong> (notificar sistemas externos) ainda não são configuráveis pela UI.
      </div>
    </div>
  );
}

// ─── Aba: Workspace (CRUD do tenant) ──────────────────────────────────────────

const PLAN_OPTS = ['free', 'starter', 'pro', 'business', 'enterprise'];
const STATUS_OPTS = ['active', 'trial', 'suspended', 'cancelled'];
const wsInput = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--ink-200)', fontSize: 13, background: '#fff', boxSizing: 'border-box', color: 'var(--ink-900)' };

function WsField({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

function WorkspaceTab() {
  const { session, tenant, isPlatformAdmin } = useAuth();
  const h = { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };

  const [allTenants, setAllTenants] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);   // { type:'ok'|'err', text }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tenant?.id) setSelectedId((p) => p || tenant.id); }, [tenant?.id]);

  useEffect(() => {
    if (!isPlatformAdmin || !session?.access_token) return;
    fetch('/api/admin/platform/tenants', { headers: h })
      .then(r => r.ok ? r.json() : { tenants: [] })
      .then(d => setAllTenants(d.tenants || []));
  }, [isPlatformAdmin, session?.access_token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!selectedId && allTenants.length > 0) setSelectedId(allTenants[0].id); }, [selectedId, allTenants]);

  const load = useCallback(() => {
    if (!selectedId || !session?.access_token) return;
    setLoading(true); setMsg(null);
    fetch(`/api/admin/platform/tenants/${selectedId}`, { headers: h })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`); return r.json(); })
      .then(d => setForm(d.tenant || null))
      .catch(e => { setForm(null); setMsg({ type: 'err', text: e.message }); })
      .finally(() => setLoading(false));
  }, [selectedId, session?.access_token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form) return;
    setSaving(true); setMsg(null);
    try {
      const payload = {
        name: form.name, email: form.email, plan: form.plan, status: form.status,
        max_instances: form.max_instances === '' || form.max_instances == null ? null : Number(form.max_instances),
        monthly_credits: form.monthly_credits === '' || form.monthly_credits == null ? null : Number(form.monthly_credits),
      };
      const res = await fetch(`/api/admin/platform/tenants/${selectedId}`, { method: 'PATCH', headers: h, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      setMsg({ type: 'ok', text: 'Workspace atualizado com sucesso.' });
      load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setSaving(false); }
  };

  const suspend = async () => {
    if (typeof window !== 'undefined' &&
        !window.confirm(`Suspender o workspace "${form?.name}"?\n\nOs usuários perdem o acesso até você reativar (mude o status de volta para "active").`)) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/platform/tenants/${selectedId}`, { method: 'DELETE', headers: h });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      setMsg({ type: 'ok', text: 'Workspace suspenso.' });
      load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Seletor de tenant (super admin) */}
      {isPlatformAdmin && allTenants.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {allTenants.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedId === t.id ? 'var(--brand-500)' : 'var(--ink-100)',
                color: selectedId === t.id ? '#fff' : 'var(--ink-600)',
                border: `1px solid ${selectedId === t.id ? 'var(--brand-500)' : 'var(--ink-200)'}`,
              }}>
              {t.name || t.slug}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ padding: 24, color: 'var(--ink-400)' }}>Carregando workspace...</div>}
      {!loading && !form && <div style={{ padding: 24, color: 'var(--ink-400)' }}>Nenhum workspace disponível.</div>}

      {!loading && form && (
        <div style={{ maxWidth: 560 }}>
          {/* Metadados imutáveis */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '12px 14px', borderRadius: 10, background: 'var(--ink-50)', border: '1px solid var(--ink-150)', fontSize: 12, color: 'var(--ink-500)', flexWrap: 'wrap' }}>
            <span>Slug: <strong style={{ color: 'var(--ink-800)' }}>{form.slug || '—'}</strong></span>
            <span>ID: <strong style={{ color: 'var(--ink-800)' }}>{form.id?.slice(0, 8)}…</strong></span>
            <span>Criado: <strong style={{ color: 'var(--ink-800)' }}>{form.created_at ? new Date(form.created_at).toLocaleDateString('pt-BR') : '—'}</strong></span>
            <span>Saldo: <strong style={{ color: 'var(--ink-800)' }}>{Number(form.credits_balance || 0).toLocaleString('pt-BR')} cr</strong></span>
          </div>

          {/* Campos editáveis */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <WsField label="Nome do workspace"><input value={form.name || ''} onChange={e => setField('name', e.target.value)} style={wsInput} /></WsField>
            <WsField label="E-mail de contato"><input type="email" value={form.email || ''} onChange={e => setField('email', e.target.value)} style={wsInput} /></WsField>
            <WsField label="Plano"><select value={form.plan || 'free'} onChange={e => setField('plan', e.target.value)} style={wsInput}>{PLAN_OPTS.map(p => <option key={p} value={p}>{p}</option>)}</select></WsField>
            <WsField label="Status"><select value={form.status || 'active'} onChange={e => setField('status', e.target.value)} style={wsInput}>{STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}</select></WsField>
            <WsField label="Máx. instâncias"><input type="number" min="0" value={form.max_instances ?? ''} onChange={e => setField('max_instances', e.target.value)} style={wsInput} /></WsField>
            <WsField label="Créditos mensais"><input type="number" min="0" value={form.monthly_credits ?? ''} onChange={e => setField('monthly_credits', e.target.value)} style={wsInput} /></WsField>
          </div>

          {msg && (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: msg.type === 'ok' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
              color: msg.type === 'ok' ? '#16a34a' : '#dc2626',
              border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
            }}>{msg.text}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--brand-500)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button onClick={suspend} disabled={saving || form.status === 'suspended'}
              style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid #fecaca', background: 'rgba(239,68,68,.06)', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: (saving || form.status === 'suspended') ? 'not-allowed' : 'pointer', opacity: (saving || form.status === 'suspended') ? 0.5 : 1 }}>
              {form.status === 'suspended' ? 'Já suspenso' : 'Suspender workspace'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba: Permissões (super admins da plataforma) ─────────────────────────────

function PermissionsTab() {
  const { session, isPlatformAdmin } = useAuth();
  const h = { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };

  const [admins, setAdmins] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);

  const load = useCallback(() => {
    if (!session?.access_token || !isPlatformAdmin) return;
    setLoading(true); setMsg(null);
    Promise.all([
      fetch('/api/admin/platform/admins', { headers: h }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/admin/platform/invites', { headers: h }).then(r => r.ok ? r.json() : { invites: [] }),
    ]).then(([a, i]) => { setAdmins(a.data || []); setInvites(i.invites || []); })
      .catch(e => setMsg({ type: 'err', text: e.message }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, isPlatformAdmin]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setMsg({ type: 'err', text: 'Informe um e-mail válido' }); return; }
    setBusy(true); setMsg(null); setLastInviteUrl(null);
    try {
      const res = await fetch('/api/admin/platform/invite', { method: 'POST', headers: h, body: JSON.stringify({ email }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setMsg({ type: 'ok', text: body.message || 'Convite criado.' });
      if (body.inviteUrl) setLastInviteUrl(body.inviteUrl);
      setInviteEmail(''); setInviteOpen(false);
      load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  const remove = async (adminId, email) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remover o super admin ${email}?\n\nPerde o acesso de plataforma imediatamente.`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/platform/remove', { method: 'POST', headers: h, body: JSON.stringify({ adminId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setMsg({ type: 'ok', text: body.message || 'Super admin removido.' });
      load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  if (!isPlatformAdmin) {
    return <div style={{ padding: 24, color: 'var(--ink-400)', textAlign: 'center' }}>Apenas super admins podem gerenciar permissões de plataforma.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 15 }}>Super admins · {loading ? '...' : admins.length}</div>
        <button onClick={() => { setInviteOpen(o => !o); setMsg(null); }}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--brand-500)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
          {inviteOpen ? '✕ Cancelar' : '+ Convidar super admin'}
        </button>
      </div>

      {inviteOpen && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: 14, marginBottom: 14, borderRadius: 10, background: 'var(--ink-50)', border: '1px solid var(--ink-150)' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5 }}>E-mail do novo super admin</label>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && invite()} placeholder="admin@empresa.com" autoFocus style={wsInput} />
          </div>
          <button onClick={invite} disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--brand-500)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Enviando...' : 'Convidar'}
          </button>
        </div>
      )}

      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.type === 'ok' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: msg.type === 'ok' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}` }}>{msg.text}</div>}

      {lastInviteUrl && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--ink-50)', border: '1px solid var(--ink-150)', fontSize: 12 }}>
          <div style={{ color: 'var(--ink-500)', marginBottom: 5 }}>Link do convite (envie ao convidado):</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 11, color: 'var(--ink-700)', wordBreak: 'break-all' }}>{lastInviteUrl}</code>
            <button onClick={() => navigator.clipboard?.writeText(lastInviteUrl)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--ink-200)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--ink-600)' }}>Copiar</button>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid var(--ink-150)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--ink-50)' }}>
            {['E-MAIL', 'STATUS', 'DESDE', 'AÇÕES'].map(c => <th key={c} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--ink-500)' }}>{c}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Carregando...</td></tr>}
            {!loading && admins.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Nenhum super admin.</td></tr>}
            {!loading && admins.map((a, i) => (
              <tr key={a.id || a.user_id} style={{ borderTop: i > 0 ? '1px solid var(--ink-100)' : 'none' }}>
                <td style={{ padding: '12px 16px', color: 'var(--ink-900)', fontWeight: 500 }}>{a.email}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ color: a.status === 'active' ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{a.status || 'active'}</span></td>
                <td style={{ padding: '12px 16px', color: 'var(--ink-500)', fontSize: 12 }}>{a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => remove(a.id || a.user_id, a.email)} disabled={busy}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: 'rgba(239,68,68,.06)', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 14, marginBottom: 10 }}>Convites pendentes · {invites.length}</div>
          <div style={{ border: '1px solid var(--ink-150)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {invites.map((inv, i) => (
                  <tr key={inv.id || i} style={{ borderTop: i > 0 ? '1px solid var(--ink-100)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--ink-700)' }}>{inv.email}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink-400)', fontSize: 12 }}>{inv.expires_at ? 'expira ' + new Date(inv.expires_at).toLocaleDateString('pt-BR') : 'pendente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba: Cobrança (billing + créditos + audit) ───────────────────────────────

function BillCard({ label, value, accent }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--ink-0)', border: '1px solid var(--ink-150)' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ? 'var(--brand-600)' : 'var(--ink-900)' }}>{value}</div>
    </div>
  );
}

function BillingTab() {
  const { session, tenant, isPlatformAdmin } = useAuth();
  const h = { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };

  const [allTenants, setAllTenants] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [billing, setBilling] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDesc, setCreditDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tenant?.id) setSelectedId(p => p || tenant.id); }, [tenant?.id]);
  useEffect(() => {
    if (!isPlatformAdmin || !session?.access_token) return;
    fetch('/api/admin/platform/tenants', { headers: h }).then(r => r.ok ? r.json() : { tenants: [] }).then(d => setAllTenants(d.tenants || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin, session?.access_token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!selectedId && allTenants.length > 0) setSelectedId(allTenants[0].id); }, [selectedId, allTenants]);

  const load = useCallback(() => {
    if (!selectedId || !session?.access_token) return;
    setLoading(true); setMsg(null);
    Promise.all([
      fetch(`/api/admin/tenants/${selectedId}/billing`, { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`/api/admin/tenants/${selectedId}/audit?limit=20`, { headers: h }).then(r => r.ok ? r.json() : { logs: [] }),
    ]).then(([b, a]) => { setBilling(b?.data || null); setAudit(a?.logs || []); })
      .catch(e => setMsg({ type: 'err', text: e.message }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, session?.access_token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const addCredits = async () => {
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setMsg({ type: 'err', text: 'Quantidade de créditos deve ser positiva' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/credits', { method: 'POST', headers: h, body: JSON.stringify({ tenantId: selectedId, amount, description: creditDesc.trim() || 'Crédito administrativo' }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setMsg({ type: 'ok', text: `+${amount} créditos adicionados.` });
      setCreditAmount(''); setCreditDesc('');
      load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {isPlatformAdmin && allTenants.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {allTenants.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: selectedId === t.id ? 'var(--brand-500)' : 'var(--ink-100)', color: selectedId === t.id ? '#fff' : 'var(--ink-600)', border: `1px solid ${selectedId === t.id ? 'var(--brand-500)' : 'var(--ink-200)'}` }}>{t.name || t.slug}</button>
          ))}
        </div>
      )}

      {loading && <div style={{ padding: 24, color: 'var(--ink-400)' }}>Carregando cobrança...</div>}

      {!loading && billing && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
            <BillCard label="Plano" value={billing.plan || '—'} />
            <BillCard label="Saldo de créditos" value={Number(billing.creditsBalance || 0).toLocaleString('pt-BR')} accent />
            <BillCard label="Créditos mensais" value={Number(billing.monthlyCredits || 0).toLocaleString('pt-BR')} />
            <BillCard label="Trial" value={billing.trialEndsAt ? (billing.isExpired ? 'Expirado' : new Date(billing.trialEndsAt).toLocaleDateString('pt-BR')) : '—'} />
          </div>

          {isPlatformAdmin && (
            <div style={{ padding: 14, marginBottom: 20, borderRadius: 10, background: 'var(--ink-50)', border: '1px solid var(--ink-150)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-800)', marginBottom: 10 }}>Adicionar créditos manualmente</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: 140 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5 }}>Quantidade</label>
                  <input type="number" min="1" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} placeholder="100" style={wsInput} />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5 }}>Descrição (opcional)</label>
                  <input value={creditDesc} onChange={e => setCreditDesc(e.target.value)} placeholder="Bônus, ajuste manual, etc." style={wsInput} />
                </div>
                <button onClick={addCredits} disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--brand-500)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>{busy ? '...' : 'Adicionar'}</button>
              </div>
            </div>
          )}

          {msg && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.type === 'ok' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: msg.type === 'ok' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}` }}>{msg.text}</div>}

          <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 14, marginBottom: 10 }}>Histórico de atividade · {audit.length}</div>
          <div style={{ border: '1px solid var(--ink-150)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {audit.length === 0 && <tr><td style={{ padding: 18, textAlign: 'center', color: 'var(--ink-400)' }}>Sem registros de auditoria.</td></tr>}
                {audit.map((l, i) => (
                  <tr key={l.id || i} style={{ borderTop: i > 0 ? '1px solid var(--ink-100)' : 'none' }}>
                    <td style={{ padding: '9px 16px', color: 'var(--ink-700)' }}>{l.action || l.event || l.type || '—'}</td>
                    <td style={{ padding: '9px 16px', color: 'var(--ink-400)', fontSize: 12, textAlign: 'right' }}>{l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !billing && <div style={{ padding: 24, color: 'var(--ink-400)' }}>{msg?.text || 'Nenhum dado de cobrança disponível.'}</div>}
    </div>
  );
}

// ─── Aba: Conta (perfil do usuário logado) ────────────────────────────────────

function ContaTab() {
  const { user, signOut } = useAuth();

  const [fullName, setFullName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [msg, setMsg] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName(user?.user_metadata?.full_name || user?.user_metadata?.tenant_name || '');
  }, [user?.id]);

  const saveProfile = async () => {
    setSavingProfile(true); setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
      if (error) throw error;
      setMsg({ type: 'ok', text: 'Perfil atualizado.' });
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setSavingProfile(false); }
  };

  const savePassword = async () => {
    if (newPass.length < 6) { setMsg({ type: 'err', text: 'A senha precisa de ao menos 6 caracteres' }); return; }
    if (newPass !== newPass2) { setMsg({ type: 'err', text: 'As senhas não conferem' }); return; }
    setSavingPass(true); setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setMsg({ type: 'ok', text: 'Senha alterada com sucesso.' });
      setNewPass(''); setNewPass2('');
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setSavingPass(false); }
  };

  if (!user) return <div style={{ padding: 24, color: 'var(--ink-400)' }}>Não autenticado.</div>;

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '12px 14px', borderRadius: 10, background: 'var(--ink-50)', border: '1px solid var(--ink-150)', fontSize: 12, color: 'var(--ink-500)', flexWrap: 'wrap' }}>
        <span>E-mail: <strong style={{ color: 'var(--ink-800)' }}>{user.email}</strong></span>
        <span>ID: <strong style={{ color: 'var(--ink-800)' }}>{user.id?.slice(0, 8)}…</strong></span>
        <span>Criado: <strong style={{ color: 'var(--ink-800)' }}>{user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—'}</strong></span>
        <span>Último acesso: <strong style={{ color: 'var(--ink-800)' }}>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : '—'}</strong></span>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)', marginBottom: 10 }}>Perfil</div>
        <div style={{ marginBottom: 12 }}><WsField label="Nome de exibição"><input value={fullName} onChange={e => setFullName(e.target.value)} style={wsInput} /></WsField></div>
        <div style={{ marginBottom: 12 }}><WsField label="E-mail (alterar requer suporte)"><input value={user.email} disabled style={{ ...wsInput, background: 'var(--ink-50)', color: 'var(--ink-500)' }} /></WsField></div>
        <button onClick={saveProfile} disabled={savingProfile} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--brand-500)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: savingProfile ? 0.6 : 1 }}>
          {savingProfile ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)', marginBottom: 10 }}>Alterar senha</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <WsField label="Nova senha"><input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} autoComplete="new-password" style={wsInput} /></WsField>
          <WsField label="Confirmar senha"><input type="password" value={newPass2} onChange={e => setNewPass2(e.target.value)} autoComplete="new-password" style={wsInput} /></WsField>
        </div>
        <button onClick={savePassword} disabled={savingPass || !newPass} style={{ marginTop: 12, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--brand-500)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: (savingPass || !newPass) ? 'not-allowed' : 'pointer', opacity: (savingPass || !newPass) ? 0.6 : 1 }}>
          {savingPass ? 'Alterando...' : 'Alterar senha'}
        </button>
      </div>

      {msg && <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.type === 'ok' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: msg.type === 'ok' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}` }}>{msg.text}</div>}

      <div style={{ paddingTop: 16, borderTop: '1px solid var(--ink-150)' }}>
        <button onClick={signOut} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--ink-200)', background: '#fff', color: 'var(--ink-700)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Sair da conta
        </button>
      </div>
    </div>
  );
}

// ─── Aba: Notificações (preferências via user_metadata) ───────────────────────

const NOTIF_GROUPS = [
  {
    group: 'E-mail', items: [
      { key: 'email_campaigns', label: 'Campanhas concluídas', desc: 'Resumo quando uma campanha termina' },
      { key: 'email_system', label: 'Alertas de sistema', desc: 'Instância caiu, risco de bloqueio' },
      { key: 'email_billing', label: 'Cobrança e créditos', desc: 'Créditos baixos, faturas, pagamentos' },
      { key: 'email_weekly', label: 'Resumo semanal', desc: 'Métricas da semana por e-mail' },
    ],
  },
  {
    group: 'Push (navegador)', items: [
      { key: 'push_inbox', label: 'Novas mensagens', desc: 'Notificação ao receber mensagem no inbox' },
      { key: 'push_instances', label: 'Status de instâncias', desc: 'Quando um número conecta/desconecta' },
    ],
  },
];
const DEFAULT_PREFS = { email_campaigns: true, email_system: true, email_billing: true, email_weekly: false, push_inbox: true, push_instances: true };

function NotifToggle({ checked, onChange }) {
  return (
    <button onClick={onChange} aria-pressed={checked} style={{ width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 2, background: checked ? 'var(--brand-500)' : 'var(--ink-200)', transition: 'background .15s', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: checked ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .15s' }} />
    </button>
  );
}

function NotificacoesTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const saved = user?.user_metadata?.notification_prefs;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setPrefs(() => ({ ...DEFAULT_PREFS, ...saved }));
  }, [user?.id]);

  const toggle = (key) => { setPrefs(p => ({ ...p, [key]: !p[key] })); setMsg(null); };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ data: { notification_prefs: prefs } });
      if (error) throw error;
      setMsg({ type: 'ok', text: 'Preferências de notificação salvas.' });
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {NOTIF_GROUPS.map(g => (
        <div key={g.group} style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)', marginBottom: 10 }}>{g.group}</div>
          <div style={{ border: '1px solid var(--ink-150)', borderRadius: 10, overflow: 'hidden' }}>
            {g.items.map((it, i) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderTop: i > 0 ? '1px solid var(--ink-100)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink-900)' }}>{it.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{it.desc}</div>
                </div>
                <NotifToggle checked={!!prefs[it.key]} onChange={() => toggle(it.key)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {msg && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.type === 'ok' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: msg.type === 'ok' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}` }}>{msg.text}</div>}

      <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--brand-500)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Salvando...' : 'Salvar preferências'}
      </button>
    </div>
  );
}

// ─── Aba: Privacidade & LGPD ──────────────────────────────────────────────────

function LgpdCard({ title, desc, children }) {
  return (
    <div style={{ border: '1px solid var(--ink-150)', borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 14, lineHeight: 1.5 }}>{desc}</div>
      {children}
    </div>
  );
}

function LgpdTab() {
  const { user, tenant } = useAuth();
  const [exported, setExported] = useState(false);

  const exportData = () => {
    const data = {
      exportadoEm: new Date().toISOString(),
      usuario: {
        id: user?.id, email: user?.email,
        nome: user?.user_metadata?.full_name || null,
        criadoEm: user?.created_at, ultimoAcesso: user?.last_sign_in_at,
        preferenciasNotificacao: user?.user_metadata?.notification_prefs || null,
      },
      workspace: tenant ? { id: tenant.id, nome: tenant.name, slug: tenant.slug, plano: tenant.plan, papel: tenant.userRole } : null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ruptur-meus-dados-${user?.id?.slice(0, 8) || 'export'}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setExported(true); setTimeout(() => setExported(false), 2500);
  };

  const requestDeletion = () => {
    const subject = encodeURIComponent('Solicitação de exclusão de conta (LGPD)');
    const body = encodeURIComponent(`Solicito a exclusão da minha conta e dados pessoais conforme a LGPD.\n\nE-mail: ${user?.email}\nID: ${user?.id}\nWorkspace: ${tenant?.name || '—'}\n\n(Estou ciente de que esta ação é irreversível.)`);
    window.location.href = `mailto:suporte@ruptur.cloud?subject=${subject}&body=${body}`;
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <LgpdCard title="Exportar meus dados" desc="Baixe uma cópia dos seus dados pessoais no Ruptur (perfil, workspace e preferências) em formato JSON — direito de acesso e portabilidade (LGPD Art. 18, II e V).">
        <button onClick={exportData} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--brand-500)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {exported ? '✓ Arquivo baixado' : 'Exportar dados (JSON)'}
        </button>
      </LgpdCard>

      <LgpdCard title="Dados que coletamos" desc="Para operar o serviço, armazenamos: e-mail e nome de login; dados do workspace (nome, plano, créditos); números WhatsApp conectados e métricas de envio; mensagens processadas (inbox e campanhas). Não vendemos seus dados a terceiros.">
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Tokens de provedores são criptografados (AES-256-GCM). Política completa em ruptur.cloud/privacidade.</div>
      </LgpdCard>

      <LgpdCard title="Excluir minha conta" desc="Direito ao esquecimento (LGPD Art. 18, VI). Ao solicitar, sua conta e dados pessoais serão removidos após confirmação. Esta ação é irreversível e encerra o acesso ao workspace.">
        <button onClick={requestDeletion} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #fecaca', background: 'rgba(239,68,68,.06)', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Solicitar exclusão da conta
        </button>
      </LgpdCard>
    </div>
  );
}

// ─── Aba genérica: Placeholder ────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
function ComingSoonTab({ label }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-400)' }}>
      <Icon name="sparkles" size={36} />
      <div style={{ marginTop: 14, fontWeight: 600, color: 'var(--ink-600)', fontSize: 15 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Em construção — disponível em breve.</div>
    </div>
  );
}

// ─── Tabs config ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users',       label: 'Usuários e papéis', component: UsersTab },
  { id: 'workspace',   label: 'Workspace',          component: WorkspaceTab },
  { id: 'conta',       label: 'Conta',              component: ContaTab },
  { id: 'billing',     label: 'Cobrança',           component: BillingTab },
  { id: 'notifs',      label: 'Notificações',       component: NotificacoesTab },
  { id: 'lgpd',        label: 'Privacidade & LGPD', component: LgpdTab },
  { id: 'conectores',  label: 'Conectores',         component: ConnectorsTab },
  { id: 'permissions', label: 'Permissões',         component: PermissionsTab },
  { id: 'uazapi',      label: 'Instâncias uazapi',  component: UazapiTab },
  { id: 'webhooks',    label: 'Webhooks',           component: WebhooksTab },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users');

  const currentTab = TABS.find(t => t.id === activeTab) || TABS[0];
  const TabComponent = currentTab.component;

  return (
    <>
      <PageHeader
        crumbs={['Ruptur OS', 'Sistema', 'Configurações']}
        title="Admin"
        sub="Workspace, equipe, integrações e segurança"
      />

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--ink-150)',
        marginBottom: 28, overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 500,
              border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === t.id ? '2px solid var(--brand-500)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--brand-500)' : 'var(--ink-500)',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color .15s',
            }}
          >
            {t.label}
            {t.badge != null && (
              <span style={{
                fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px',
                borderRadius: 9, background: activeTab === t.id ? 'var(--brand-500)' : 'var(--ink-200)',
                color: activeTab === t.id ? '#fff' : 'var(--ink-600)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <TabComponent key={activeTab} />
    </>
  );
}
