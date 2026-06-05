/**
 * publicChrome — nav + footer + CSS compartilhados das páginas públicas (blog).
 * Tema claro, alinhado à landing. O footer carrega o backlink da 2DL Company.
 */
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n/index.jsx';
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx';

export function fmtDate(iso, lang) {
  try {
    const loc = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[lang] || 'pt-BR';
    return new Date(iso + 'T00:00:00').toLocaleDateString(loc, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

export const PUBLIC_CSS = `
  .pub { background: var(--ink-0); min-height: 100vh; color: var(--ink-900); font-family: 'Inter', system-ui, sans-serif; }
  .pub-nav { position: sticky; top: 0; z-index: 30; background: rgba(255,255,255,.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--ink-150); }
  .pub-nav-inner { max-width: 880px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; gap: 16px; }
  .pub-logo { display: inline-flex; align-items: center; gap: 9px; font-weight: 700; font-size: 16px; letter-spacing: -.01em; background: none; border: none; cursor: pointer; color: var(--ink-900); }
  .pub-logo-mark { width: 28px; height: 28px; border-radius: 8px; background: var(--brand-500); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; }
  .pub-nav-right { margin-left: auto; }

  .pub-wrap { max-width: 880px; margin: 0 auto; padding: 0 24px; }
  .pub-footer { border-top: 1px solid var(--ink-150); margin-top: 64px; }
  .pub-footer-inner { max-width: 880px; margin: 0 auto; padding: 28px 24px; display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; color: var(--ink-500); font-size: 12.5px; }
  .pub-footer-inner a { color: var(--brand-600); font-weight: 600; }
  .pub-footer-inner a:hover { text-decoration: underline; }

  .blog-head { padding: 56px 0 8px; }
  .blog-head h1 { font-size: 40px; font-weight: 800; letter-spacing: -.03em; margin: 0 0 12px; }
  .blog-head p { font-size: 17px; color: var(--ink-600); max-width: 620px; margin: 0; line-height: 1.55; }
  .blog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 40px 0; }
  .blog-card { text-align: left; background: var(--ink-25, #fafafa); border: 1px solid var(--ink-150); border-radius: 16px; padding: 22px; cursor: pointer; transition: border-color .15s, transform .15s; display: flex; flex-direction: column; gap: 10px; font-family: inherit; }
  .blog-card:hover { border-color: var(--brand-300, #ffd0bd); transform: translateY(-2px); }
  .blog-card-cover { font-size: 30px; }
  .blog-tag { display: inline-block; align-self: flex-start; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--brand-600); background: var(--brand-50); padding: 3px 9px; border-radius: 999px; }
  .blog-card h3 { font-size: 18px; font-weight: 750; line-height: 1.25; margin: 2px 0 0; letter-spacing: -.01em; color: var(--ink-900); }
  .blog-card p { font-size: 13.5px; color: var(--ink-600); line-height: 1.5; margin: 0; }
  .blog-card-meta { margin-top: auto; font-size: 12px; color: var(--ink-500); }

  .post { padding: 48px 0 0; }
  .post-meta { font-size: 12.5px; color: var(--ink-500); margin-bottom: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .post h1 { font-size: 36px; font-weight: 800; letter-spacing: -.025em; line-height: 1.12; margin: 0 0 24px; }
  .post-body { font-size: 16.5px; line-height: 1.7; color: var(--ink-800); }
  .post-body h2 { font-size: 22px; font-weight: 750; letter-spacing: -.01em; margin: 32px 0 10px; color: var(--ink-900); }
  .post-body p { margin: 0 0 18px; }
  .post-body ul { margin: 0 0 18px; padding-left: 22px; }
  .post-body li { margin-bottom: 8px; }
  .post-body strong { color: var(--ink-900); font-weight: 650; }
  .post-back { display: inline-block; margin: 36px 0 8px; color: var(--brand-600); font-weight: 600; cursor: pointer; background: none; border: none; font-size: 14px; padding: 0; font-family: inherit; }
  .post-back:hover { text-decoration: underline; }

  @media (max-width: 720px) {
    .blog-grid { grid-template-columns: 1fr; }
    .blog-head h1 { font-size: 32px; }
    .post h1 { font-size: 28px; }
  }
`;

export function PublicNav() {
  const navigate = useNavigate();
  return (
    <nav className="pub-nav">
      <div className="pub-nav-inner">
        <button className="pub-logo" onClick={() => navigate('/')}>
          <span className="pub-logo-mark">R</span><span>Ruptur OS</span>
        </button>
        <div className="pub-nav-right"><LanguageSwitcher /></div>
      </div>
    </nav>
  );
}

export function PublicFooter() {
  const t = useT();
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <span>{t('footer.copyright')}</span>
        <span>
          {t('footer.madeBy')}{' '}
          <a href="https://2dlcompany.com.br" target="_blank" rel="noopener">2DL Company</a>
          {' · '}{t('footer.madeIn')} 🇧🇷
        </span>
      </div>
    </footer>
  );
}
