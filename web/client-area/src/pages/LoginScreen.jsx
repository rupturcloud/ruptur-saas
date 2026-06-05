import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ArrowRight, Loader2, Zap, MessageCircle, TrendingUp, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * LoginScreen — Autenticação via Supabase Auth.
 * Design V0 laranja (#FF6A3D / #0E1116), split-screen: branding + form.
 * Lógica de auth preservada: signIn, ?next, signup link.
 */
const LoginScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Informe seu e-mail');
    if (!password) return setError('Informe sua senha');

    setLoading(true);
    try {
      await signIn(email, password);
      const next = searchParams.get('next');
      navigate(next || '/v0/dashboard');
    } catch (err) {
      if (err.message?.includes('Invalid login')) {
        setError('E-mail ou senha incorretos.');
      } else {
        setError(err.message || 'Erro ao fazer login');
      }
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
          <h2 className="v0-login__headline">A máquina de vendas no WhatsApp.</h2>
          <p className="v0-login__pitch">
            Conecta seus números, aquece com segurança e vende no automático.
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
            <h1>Entrar na Ruptur</h1>
            <p>Acesse seu painel de automação</p>
          </div>

          <form onSubmit={handleSubmit} autoComplete="on">
            <label className="v0-field">
              <span>E-mail</span>
              <div className="v0-input">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="v0-field">
              <span>Senha</span>
              <div className="v0-input">
                <Lock size={18} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="v0-input__toggle"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className="v0-login__error">{error}</div>}

            <button type="submit" className="v0-login__btn" disabled={loading}>
              {loading ? <Loader2 size={20} className="v0-spin" /> : <>Entrar <ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="v0-login__foot">
            Não tem conta? <Link to="/signup">Criar conta grátis</Link>
          </p>
        </div>
      </main>

      <style>{`
        .v0-login{min-height:100vh;display:flex;background:#0E1116;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif}

        /* Branding (esquerda, desktop) */
        .v0-login__brand{position:relative;flex:1 1 50%;display:none;flex-direction:column;justify-content:center;padding:56px;overflow:hidden;background:linear-gradient(160deg,#14181f 0%,#0E1116 60%);border-right:1px solid #1F242E}
        .v0-login__glow{position:absolute;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(255,106,61,.16),transparent 70%);top:-130px;right:-150px;pointer-events:none}
        .v0-login__brand-inner{position:relative;z-index:2;max-width:430px}
        .v0-login__headline{font-size:2.15rem;font-weight:800;line-height:1.12;letter-spacing:-1px;margin:0 0 16px}
        .v0-login__pitch{font-size:1rem;color:#9CA3AF;line-height:1.55;margin:0 0 32px}
        .v0-login__features{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px}
        .v0-login__features li{display:flex;align-items:center;gap:10px;font-size:.92rem;color:#C9CFD8}
        .v0-login__features li svg{color:#FF6A3D;flex-shrink:0}

        /* Marca / logo */
        .v0-login__logo{display:flex;align-items:center;gap:10px;margin-bottom:40px}
        .v0-login__logo-text{font-size:1.3rem;font-weight:800;letter-spacing:-.5px}
        .v0-login__mark{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#FF6A3D,#F0531F);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 20px rgba(255,106,61,.35);flex-shrink:0}
        .v0-login__mark--sm{width:34px;height:34px;border-radius:9px}

        /* Form (direita) */
        .v0-login__main{flex:1 1 50%;display:flex;align-items:center;justify-content:center;padding:24px}
        .v0-login__card{width:100%;max-width:400px}
        .v0-login__head{margin-bottom:28px}
        .v0-login__head .v0-login__mark{margin-bottom:18px}
        .v0-login__head h1{font-size:1.5rem;font-weight:800;letter-spacing:-.5px;margin:0 0 6px}
        .v0-login__head p{font-size:.9rem;color:#6B7380;margin:0}

        .v0-field{display:block;margin-bottom:16px}
        .v0-field>span{display:block;font-size:.82rem;font-weight:600;color:#9CA3AF;margin-bottom:7px}
        .v0-input{position:relative;display:flex;align-items:center;background:#171B22;border:1px solid #262D3A;border-radius:11px;transition:border-color .15s,box-shadow .15s}
        .v0-input>svg{position:absolute;left:13px;color:#6B7380;pointer-events:none}
        .v0-input input{width:100%;padding:13px 14px 13px 42px;background:transparent;border:none;color:#fff;font-size:.95rem;font-family:inherit}
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
        .v0-login__foot{text-align:center;margin-top:22px;font-size:.88rem;color:#6B7380}
        .v0-login__foot a{color:#FF6A3D;text-decoration:none;font-weight:600}
        .v0-login__foot a:hover{text-decoration:underline}
        @keyframes v0spin{to{transform:rotate(360deg)}}.v0-spin{animation:v0spin .8s linear infinite}

        @media(min-width:900px){.v0-login__brand{display:flex}}
      `}</style>
    </div>
  );
};

export default LoginScreen;
