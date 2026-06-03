/**
 * TenantSwitcher — seletor de tenant (workspace) para usuários com acesso a
 * mais de um tenant (ex: super_admin de ruptur-os e ruptur-demo).
 *
 * Lê tenant/tenants/switchTenant do AuthContext. Ao trocar, persiste a escolha
 * (localStorage 'ruptur_active_tenant') e recarrega a página para que todas as
 * telas re-busquem dados do novo tenant — o gateway respeita o X-Tenant-Id
 * (validado por membership) que o httpClient/inbox.api enviam.
 *
 * Não renderiza nada quando o usuário tem 0 ou 1 tenant.
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function TenantSwitcher() {
  const { tenant, tenants, switchTenant } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Só faz sentido com 2+ tenants
  if (!tenant || (tenants || []).length <= 1) return null;

  const choose = (id) => {
    setOpen(false);
    if (id === tenant.id) return;
    switchTenant(id);
    // Recarrega para todas as telas re-buscarem dados do novo tenant
    try { window.location.reload(); } catch { /* noop */ }
  };

  const label = tenant.name || tenant.slug || 'Workspace';

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Trocar de workspace"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 34, padding: '0 10px', borderRadius: 9,
          border: '1px solid var(--ink-200)', background: 'var(--ink-0)',
          color: 'var(--ink-800)', fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer', maxWidth: 220,
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--brand-500, #FF6A3D), #FFB088)',
          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
        }}>{(label[0] || 'W').toUpperCase()}</span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'var(--ink-400)', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          minWidth: 248, background: 'var(--ink-0)', border: '1px solid var(--ink-200)',
          borderRadius: 11, boxShadow: '0 12px 32px rgba(14,17,22,.16)', padding: 6,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
            color: 'var(--ink-400)', padding: '6px 10px 4px',
          }}>Workspaces</div>
          {tenants.map((t) => {
            const active = t.id === tenant.id;
            const tl = t.name || t.slug;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => choose(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: active ? 'var(--brand-50, #FFF4F1)' : 'transparent',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--ink-50)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: active ? 'linear-gradient(135deg, var(--brand-500, #FF6A3D), #FFB088)' : 'var(--ink-100)',
                  color: active ? '#fff' : 'var(--ink-600)', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                }}>{(tl[0] || 'W').toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.8, fontWeight: 600, color: 'var(--ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tl}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-400)' }}>{t.slug}{t.userRole ? ` · ${t.userRole}` : ''}</span>
                </span>
                {active && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500, #FF6A3D)" strokeWidth="2.6" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
