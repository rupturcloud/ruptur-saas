/**
 * LanguageSwitcher — seletor pt/en/es. Self-contained (inline styles),
 * funciona tanto no tema claro (landing/blog) quanto no escuro (app).
 */
import { useI18n } from '../i18n/index.jsx';

const META = {
  pt: { flag: '🇧🇷', code: 'PT' },
  en: { flag: '🇺🇸', code: 'EN' },
  es: { flag: '🇪🇸', code: 'ES' },
};

export default function LanguageSwitcher() {
  const { lang, setLang, supported } = useI18n();
  return (
    <div
      role="group"
      aria-label="Idioma / Language / Idioma"
      style={{
        display: 'inline-flex', gap: 2, padding: 3,
        background: 'rgba(127,127,127,.10)',
        border: '1px solid rgba(127,127,127,.18)',
        borderRadius: 999,
      }}
    >
      {supported.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            title={META[l].code}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', border: 'none', borderRadius: 999,
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit', lineHeight: 1,
              background: active ? 'var(--brand-500, #FF6A3D)' : 'transparent',
              color: active ? '#fff' : 'var(--ink-600, #9aa3b2)',
              transition: 'background .15s, color .15s',
            }}
          >
            <span style={{ fontSize: 13 }}>{META[l].flag}</span>
            <span>{META[l].code}</span>
          </button>
        );
      })}
    </div>
  );
}
