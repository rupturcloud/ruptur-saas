/**
 * LanguagePreferenceSync — aplica o idioma padrão salvo na conta do usuário
 * (Supabase auth user_metadata.preferred_language) uma única vez por login.
 * Não sobrescreve trocas manuais feitas durante a sessão (o seletor da nav).
 * Renderiza null — vive dentro de <AuthProvider> + <I18nProvider> (em App).
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';

export default function LanguagePreferenceSync() {
  const { session } = useAuth();
  const { setLang } = useI18n();
  const appliedFor = useRef(null);

  useEffect(() => {
    const uid = session?.user?.id;
    const pref = session?.user?.user_metadata?.preferred_language;
    if (uid && pref && appliedFor.current !== uid) {
      appliedFor.current = uid;
      setLang(pref);
    }
  }, [session, setLang]);

  return null;
}
