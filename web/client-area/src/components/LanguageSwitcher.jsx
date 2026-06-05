/**
 * LanguageSwitcher — botão único com dropdown (list) para escolher o idioma.
 * Self-contained (inline styles), funciona no tema claro (landing/blog) e escuro (app).
 * Abre para cima ou para baixo conforme o espaço disponível na viewport.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '../i18n/index.jsx';

const META = {
  pt: { flag: '🇧🇷', code: 'PT', label: 'Português' },
  en: { flag: '🇺🇸', code: 'EN', label: 'English' },
  es: { flag: '🇪🇸', code: 'ES', label: 'Español' },
};

export default function LanguageSwitcher() {
  const { lang, setLang, supported } = useI18n();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);

  const current = META[lang] || META.pt;

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next && ref.current) {
        try {
          const r = ref.current.getBoundingClientRect();
          setDropUp(r.bottom > window.innerHeight * 0.6);
        } catch { /* ignora */ }
      }
      return next;
    });
  }, []);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (l) => { setLang(l); setOpen(false); };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Idioma / Language / Idioma"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 9, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, lineHeight: 1,
          background: 'rgba(127,127,127,.10)',
          border: '1px solid rgba(127,127,127,.20)',
          color: 'var(--ink-700, #C9CFD8)',
          transition: 'background .15s, border-color .15s',
        }}
      >
        <span style={{ fontSize: 14 }}>{current.flag}</span>
        <span>{current.code}</span>
        <span style={{ fontSize: 9, opacity: .7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Idiomas"
          style={{
            position: 'absolute',
            right: 0,
            [dropUp ? 'bottom' : 'top']: 'calc(100% + 6px)',
            minWidth: 168,
            margin: 0, padding: 5, listStyle: 'none', zIndex: 1000,
            background: 'var(--menu-bg, #161B22)',
            border: '1px solid rgba(127,127,127,.22)',
            borderRadius: 11,
            boxShadow: '0 12px 32px rgba(0,0,0,.28)',
          }}
        >
          {supported.map((l) => {
            const m = META[l];
            const active = l === lang;
            return (
              <li
                key={l}
                role="option"
                aria-selected={active}
                onClick={() => choose(l)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13.5, fontWeight: active ? 700 : 500,
                  color: active ? 'var(--brand-500, #FF6A3D)' : 'var(--ink-700, #C9CFD8)',
                  background: active ? 'rgba(255,106,61,.10)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(127,127,127,.12)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 16 }}>{m.flag}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {active && <span style={{ color: 'var(--brand-500, #FF6A3D)', fontWeight: 800 }}>✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
