/**
 * i18n — engine leve, sem dependências externas.
 * Idiomas: pt (padrão), en, es. Persiste escolha em localStorage e detecta navegador.
 * Uso:
 *   const t = useT();            t('footer.madeBy')
 *   const { lang, setLang } = useI18n();
 */
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import pt from './locales/pt.js';
import en from './locales/en.js';
import es from './locales/es.js';

const DICTS = { pt, en, es };
export const SUPPORTED = ['pt', 'en', 'es'];
export const DEFAULT_LANG = 'pt';
const STORAGE_KEY = 'ruptur:lang';

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const nav = (navigator.language || DEFAULT_LANG).slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(nav)) return nav;
  } catch { /* SSR/preview sem window: ignora */ }
  return DEFAULT_LANG;
}

// resolve caminho pontilhado: resolve(dict, 'footer.madeBy')
function resolve(dict, key) {
  return String(key).split('.').reduce(
    (acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined),
    dict,
  );
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang);

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* ignora */ }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignora */ }
  }, []);

  const t = useCallback((key, vars) => {
    let val = resolve(DICTS[lang], key);
    if (val === undefined) val = resolve(DICTS[DEFAULT_LANG], key); // fallback pt
    if (val === undefined) return key;                              // último recurso: a própria chave
    if (vars && typeof val === 'string') {
      val = val.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
    }
    return val;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, supported: SUPPORTED }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n precisa estar dentro de <I18nProvider>');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
