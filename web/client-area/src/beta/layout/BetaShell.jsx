/**
 * BetaShell.jsx — Shell do BETA /beta-bubble (V0 laranja)
 *
 * Superfície separada do app /v0: mesma identidade visual (laranja #FF6A3D /
 * fundo #0E1116), mas com navegação própria sob /beta-bubble/*. Reusa a auth
 * Supabase/tenants já existentes (montado dentro de ProtectedRoute no App.jsx).
 *
 * Por que um shell próprio: o AppShell de /v0 fixa os NavLink em /v0/*, então
 * reusá-lo jogaria o usuário de volta pro app principal. O beta precisa de um
 * núcleo de navegação isolado enquanto serve de ponte até o backend nativo
 * definitivo ficar 100%.
 */
import { useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon } from '../../ds/index.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

const NAV = [
  { id: 'campanhas',  label: 'Campanhas',  icon: 'flag' },
  { id: 'disparador', label: 'Disparador', icon: 'broadcast' },
  { id: 'leads',      label: 'Leads',      icon: 'leads' },
  { id: 'monitor',    label: 'Monitor',    icon: 'trendUp' },
];

function Sidebar({ onSignOut }) {
  const { session, tenant } = useAuth();
  const userName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split('@')[0] ||
    'Usuário';
  const userInitials = userName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const planLabel = tenant?.plan || tenant?.name || 'Beta';

  return (
    <aside style={{
      flexShrink: 0, width: 240, background: '#0E1116',
      borderRight: '1px solid rgba(255,255,255,0.06)', height: '100vh',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Brand + selo BETA */}
      <div style={{ padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: '#FF6A3D',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>R</div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F9FAFB', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            Ruptur
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: '#0E1116',
              background: '#FF6A3D', borderRadius: 5, padding: '1px 5px',
            }}>BETA</span>
          </div>
          <div style={{ fontSize: 10, color: '#6B7280', whiteSpace: 'nowrap' }}>Disparos WhatsApp</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6 }}>
        <nav>
          {NAV.map((it) => (
            <NavLink
              key={it.id}
              to={`/beta-bubble/${it.id}`}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px',
                margin: '0 4px', borderRadius: 7, textDecoration: 'none',
                color: '#9CA3AF', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              <Icon name={it.icon} size={15} />
              <span style={{ flex: 1 }}>{it.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Voltar ao app principal */}
        <div style={{ marginTop: 10, padding: '0 4px' }}>
          <NavLink to="/v0/dashboard" className="side-link" style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px',
            borderRadius: 7, textDecoration: 'none', color: '#6B7280', fontSize: 12, fontWeight: 500,
          }}>
            <Icon name="dashboard" size={14} />
            <span>← App principal</span>
          </NavLink>
        </div>
      </div>

      {/* Rodapé: perfil + sair */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#FF6A3D',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>{userInitials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{planLabel}</div>
          </div>
        </div>
        <button onClick={onSignOut} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
          borderRadius: 8, border: '1px solid rgba(255,106,61,0.25)', background: 'rgba(255,106,61,0.06)',
          color: '#FF8C69', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sair da conta
        </button>
      </div>
    </aside>
  );
}

export default function BetaShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate('/login', { replace: true });
  }, [signOut, navigate]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar onSignOut={handleSignOut} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div className="page" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
