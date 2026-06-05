import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, Eye, EyeOff, Loader2, MessageCircle, TrendingUp, Shield, Gift } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * SignUp — Criação de conta via Supabase Auth.
 * Design V0 laranja (#FF6A3D / #0E1116), consistente com o LoginScreen.
 * Lógica preservada: signUp(email, password, name) → /onboarding.
 */
export default function SignUp() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return setError('Preencha todos os campos');
    if (form.password.length < 6) return setError('Senha mínima: 6 caracteres');
    setLoading(true);
    try {
      await signUp(form.email, form.password, form.name);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="v0-login">
      {/* Painel de branding — só desktop */}
      <aside className="v0-login__brand">
        <div className="v0-login__glow" />
        <div className="v0-login__brand-inner">
          <div className="v0-login__logo">
            <span className="v0-login__mark"><Zap size={22} fill="currentColor" /></span>
            <span className="v0-login__logo-text">Ruptur</span>
          </div>
          <h2 className="v0-login__headline">Comece grátis hoje.</h2>
          <p className="v0-login__pitch">
            50 créditos inclusos, sem cartão. Conecte seu primeiro número em minutos.
          </p>
          <ul className="v0-login__features">
            <li><MessageCircle size={16} /> Múltiplos números, um único inbox</li>
            <li><Shield size={16} /> Aquecimento anti-bloqueio</li>
            <li><TrendingUp size={16} /> Campanhas que se otimizam sozinhas</li>
          </ul>
        </div>
      </aside>

      {/* Form */}
      <main className="v0-login__main">
        <div className="v0-login__card">
          <div className="v0-login__head">
            <span className="v0-login__mark v0-login__mark--sm"><Zap size={18} fill="currentColor" /></span>
            <h1>Crie sua conta</h1>
            <p>Comece grátis com 50 créditos. Sem cartão.</p>
          </div>

          <form onSubmit={handleSubmit} autoComplete="on">
            <label className="v0-field">
              <span>Nome do negócio</span>
              <div className="v0-input v0-input--plain">
                <input name="name" placeholder="Ex: Murilo Rifas" value={form.name} onChange={handleChange} autoFocus />
              </div>
            </label>

            <label className="v0-field">
              <span>E-mail</span>
              <div className="v0-input v0-input--plain">
                <input name="email" type="email" placeholder="voce@empresa.com" value={form.email} onChange={handleChange} autoComplete="email" />
              </div>
            </label>

            <label className="v0-field">
              <span>Senha</span>
              <div className="v0-input v0-input--plain">
                <input
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
                <button type="button" className="v0-input__toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className="v0-login__error">{error}</div>}

            <button type="submit" className="v0-login__btn" disabled={loading}>
              {loading ? <Loader2 size={20} className="v0-spin" /> : <>Começar grátis <ArrowRight size={18} /></>}
            </button>
          </form>

          <div className="v0-login__badge"><Gift size={15} /> 50 créditos grátis • Sem cartão</div>

          <p className="v0-login__foot">
            Já tem conta? <Link to="/login">Acessar minha conta</Link>
          </p>
        </div>
      </main>

      <style>{`
        .v0-login{min-height:100vh;display:flex;background:#0E1116;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif}
        .v0-login__brand{position:relative;flex:1 1 50%;display:none;flex-direction:column;justify-content:center;padding:56px;overflow:hidden;background:linear-gradient(160deg,#14181f 0%,#0E1116 60%);border-right:1px solid #1F242E}
        .v0-login__glow{position:absolute;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(255,106,61,.16),transparent 70%);top:-130px;right:-150px;pointer-events:none}
        .v0-login__brand-inner{position:relative;z-index:2;max-width:430px}
        .v0-login__headline{font-size:2.15rem;font-weight:800;line-height:1.12;letter-spacing:-1px;margin:0 0 16px}
        .v0-login__pitch{font-size:1rem;color:#9CA3AF;line-height:1.55;margin:0 0 32px}
        .v0-login__features{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px}
        .v0-login__features li{display:flex;align-items:center;gap:10px;font-size:.92rem;color:#C9CFD8}
        .v0-login__features li svg{color:#FF6A3D;flex-shrink:0}
        .v0-login__logo{display:flex;align-items:center;gap:10px;margin-bottom:40px}
        .v0-login__logo-text{font-size:1.3rem;font-weight:800;letter-spacing:-.5px}
        .v0-login__mark{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#FF6A3D,#F0531F);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 20px rgba(255,106,61,.35);flex-shrink:0}
        .v0-login__mark--sm{width:34px;height:34px;border-radius:9px}
        .v0-login__main{flex:1 1 50%;display:flex;align-items:center;justify-content:center;padding:24px}
        .v0-login__card{width:100%;max-width:400px}
        .v0-login__head{margin-bottom:24px}
        .v0-login__head .v0-login__mark{margin-bottom:18px}
        .v0-login__head h1{font-size:1.5rem;font-weight:800;letter-spacing:-.5px;margin:0 0 6px}
        .v0-login__head p{font-size:.9rem;color:#6B7380;margin:0}
        .v0-field{display:block;margin-bottom:16px}
        .v0-field>span{display:block;font-size:.82rem;font-weight:600;color:#9CA3AF;margin-bottom:7px}
        .v0-input{position:relative;display:flex;align-items:center;background:#171B22;border:1px solid #262D3A;border-radius:11px;transition:border-color .15s,box-shadow .15s}
        .v0-input>svg{position:absolute;left:13px;color:#6B7380;pointer-events:none}
        .v0-input input{width:100%;padding:13px 14px 13px 42px;background:transparent;border:none;color:#fff;font-size:.95rem;font-family:inherit}
        .v0-input--plain input{padding-left:14px}
        .v0-input input:focus{outline:none}
        .v0-input:focus-within{border-color:#FF6A3D;box-shadow:0 0 0 3px rgba(255,106,61,.12)}
        .v0-input input::placeholder{color:#4B5563}
        .v0-input__toggle{position:absolute;right:10px;background:none;border:none;color:#6B7380;cursor:pointer;padding:5px;display:flex}
        .v0-input__toggle:hover{color:#9CA3AF}
        .v0-login__error{padding:11px 14px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;color:#f87171;font-size:.85rem;margin-bottom:16px}
        .v0-login__btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:#FF6A3D;border:none;border-radius:11px;color:#fff;font-weight:700;font-size:.98rem;cursor:pointer;transition:background .15s,transform .1s;box-shadow:0 4px 16px rgba(255,106,61,.3)}
        .v0-login__btn:hover:not(:disabled){background:#F0531F}
        .v0-login__btn:active:not(:disabled){transform:scale(.985)}
        .v0-login__btn:disabled{opacity:.65;cursor:not-allowed}
        .v0-login__badge{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;padding:11px;background:rgba(255,106,61,.07);border:1px solid rgba(255,106,61,.16);border-radius:10px;font-size:.84rem;color:#FF6A3D;font-weight:600}
        .v0-login__foot{text-align:center;margin-top:18px;font-size:.88rem;color:#6B7380}
        .v0-login__foot a{color:#FF6A3D;text-decoration:none;font-weight:600}
        .v0-login__foot a:hover{text-decoration:underline}
        @keyframes v0spin{to{transform:rotate(360deg)}}.v0-spin{animation:v0spin .8s linear infinite}
        @media(min-width:900px){.v0-login__brand{display:flex}}
      `}</style>
    </div>
  );
}
