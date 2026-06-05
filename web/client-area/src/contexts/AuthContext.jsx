/**
 * AuthContext — Contexto global de autenticação
 *
 * Gerencia sessão Supabase + dados do tenant logado.
 * Substitui completamente o login por string e localStorage.
 */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const bootstrappedRef = useRef(false);

  const finishInitialAuth = useCallback(() => {
    bootstrappedRef.current = true;
    setAuthReady(true);
    setLoading(false);
  }, []);

  // Busca todos os tenants do user e define o ativo (respeitando escolha persistida).
  // Multi-tenant: alimenta o seletor de tenant (TenantSwitcher).
  const fetchTenant = useCallback(async (userId) => {
    try {
      const { data: memberships, error: membError } = await supabase
        .from('user_tenant_memberships')
        .select('tenant_id, role')
        .eq('user_id', userId);

      if (membError) {
        logger.error('[Auth] Erro ao buscar memberships', membError, { userId });
        setTenant(null); setTenants([]);
        return;
      }
      if (!memberships || memberships.length === 0) {
        logger.info('[Auth] Usuário sem tenant vinculado', { userId });
        setTenant(null); setTenants([]);
        return;
      }

      // Carrega TODOS os tenants das memberships (para o seletor multi-tenant)
      const tenantIds = memberships.map((m) => m.tenant_id);
      const { data: tenantRows, error: tErr } = await supabase
        .from('tenants')
        .select('id, slug, name, plan, status')
        .in('id', tenantIds);
      if (tErr) logger.warn('[Auth] Erro ao buscar tenants', tErr);

      const roleByTenant = Object.fromEntries(memberships.map((m) => [m.tenant_id, m.role]));
      const list = (tenantRows || []).map((t) => ({ ...t, userRole: roleByTenant[t.id] || 'member' }));
      setTenants(list);

      // Tenant ativo: escolha persistida > preferência (ruptur-os > "Ruptur (PROD)") > primeiro
      let persisted = null;
      try { persisted = window.localStorage.getItem('ruptur_active_tenant'); } catch { /* noop */ }
      const active = (persisted && list.find((t) => t.id === persisted))
        || list.find((t) => t.slug === 'ruptur-os')
        || list.find((t) => t.name === 'Ruptur (PROD)')
        || list[0]
        || null;

      if (active) {
        logger.info('[Auth] Tenant ativo', { slug: active.slug, tenantId: active.id });
        setTenant(active);
      } else {
        setTenant(null);
      }
    } catch (err) {
      logger.error('[Auth] Erro inesperado em fetchTenant', err, { userId });
      setTenant(null); setTenants([]);
    }
  }, []);

  // Troca o tenant ativo (multi-tenant) e persiste a escolha em localStorage.
  const switchTenant = useCallback((tenantId) => {
    const next = tenants.find((t) => t.id === tenantId);
    if (!next) return;
    try { window.localStorage.setItem('ruptur_active_tenant', tenantId); } catch { /* noop */ }
    setTenant(next);
  }, [tenants]);

  // Verifica se o usuário é superadmin
  const checkPlatformAdmin = useCallback(async (token) => {
    try {
      const res = await fetch('/api/admin/platform/check', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setIsPlatformAdmin(data.isPlatformAdmin === true);
      } else {
        setIsPlatformAdmin(false);
      }
    } catch (err) {
      console.warn('[Auth] Erro ao verificar status de superadmin:', err);
      setIsPlatformAdmin(false);
    }
  }, []);

  // Carrega sessão existente e escuta mudanças
  useEffect(() => {
    let isMounted = true;

    // Failsafe: nunca deixa o app preso em "Carregando..." eternamente. Se o
    // bootstrap não finalizar em 8s (endpoint pendurado, rede lenta, query que
    // não resolve), libera a UI mesmo assim. finishInitialAuth é idempotente.
    const bootstrapFailsafe = setTimeout(() => {
      if (isMounted && !bootstrappedRef.current) {
        console.warn('[Auth] Failsafe: bootstrap não finalizou em 8s — liberando UI');
        finishInitialAuth();
      }
    }, 8000);

    async function initializeSession() {
      setLoading(true);

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.warn('[Auth] Falha ao verificar sessão:', error.message);
          if (!isMounted) return;
          setSession(null);
          setUser(null);
          setTenant(null);
          finishInitialAuth();
          return;
        }

        const currentSession = data?.session ?? null;
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          await fetchTenant(currentSession.user.id);
          if (currentSession.access_token) {
            await checkPlatformAdmin(currentSession.access_token);
          }
          if (isMounted) finishInitialAuth();
        } else {
          setTenant(null);
          setIsPlatformAdmin(false);
          finishInitialAuth();
        }
      } catch (err) {
        console.error('[Auth] Erro inesperado ao verificar sessão:', err);
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setTenant(null);
        finishInitialAuth();
      }
    }

    initializeSession();

    // Listener de mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        const isInitialAuthEvent = !bootstrappedRef.current;
        if (isInitialAuthEvent) setLoading(true);
        setSession(newSession);
        setUser(newSession?.user ?? null);

        try {
          if (newSession?.user) {
            await fetchTenant(newSession.user.id);
            if (newSession.access_token) {
              await checkPlatformAdmin(newSession.access_token);
            }
          } else {
            setTenant(null);
            setIsPlatformAdmin(false);
          }
        } catch (err) {
          console.error('[Auth] Erro ao processar mudança de sessão:', err);
          setTenant(null);
          setIsPlatformAdmin(false);
        } finally {
          // BUG FIX (login preso em "Carregando..."): o loading precisa SEMPRE
          // ser finalizado. Antes, finishInitialAuth() só rodava no evento inicial,
          // então após um signIn() subsequente (página já bootstrapped) o loading
          // setado por signIn() ficava preso em true para sempre — tela eterna.
          if (isInitialAuthEvent) {
            finishInitialAuth();
          } else {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(bootstrapFailsafe);
      subscription.unsubscribe();
    };
  }, [fetchTenant, checkPlatformAdmin, finishInitialAuth]);

  // Sign Up — cria conta + provisiona tenant
  const signUp = useCallback(async (email, password, tenantName) => {
    setLoading(true);

    // 1. Cria user no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { tenant_name: tenantName }, // Metadata custom
      },
    });

    if (authError) {
      setLoading(false);
      throw authError;
    }

    // 2. Provisiona tenant via API do backend (com service_role)
    //    O backend escuta o webhook de auth ou fazemos via API
    if (authData.user) {
      try {
        const res = await fetch('/api/tenants/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.session?.access_token}`,
          },
          body: JSON.stringify({
            userId: authData.user.id,
            email,
            tenantName,
          }),
        });

        if (!res.ok) {
          console.warn('[Auth] Falha no provisionamento, tentará no próximo login');
        }
      } catch (err) {
        console.warn('[Auth] Provisionamento offline:', err.message);
      }
    }

    return authData;
  }, []);

  // Sign In com email + password
  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      throw error;
    }

    return data;
  }, []);

  // Sign Out
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    try { window.localStorage.removeItem('ruptur_active_tenant'); } catch { /* noop */ }
    setSession(null);
    setUser(null);
    setTenant(null);
    setTenants([]);
  }, []);

  // Helpers derivados
  const isAuthenticated = !!session && !!user;
  const isAdmin = user?.email === 'admin@ruptur.cloud' || tenant?.userRole === 'owner';
  const tenantId = tenant?.id ?? null;

  // Expõe { token, tenantId } no escopo global para os clients HTTP que vivem
  // fora da árvore React: httpClient.js, inbox.api.js, admin.api.js e o SSE do
  // Inbox leem window.__ruptur.auth. Esse contrato já está DOCUMENTADO nesses
  // arquivos ("setado por AuthContext"), mas nunca era cumprido — sem ele o
  // gateway recebe requests sem Authorization: Bearer e responde 401.
  //
  // A corrida de timing (efeito do pai roda após os filhos) é tratada no
  // inbox.api.js, que usa o localStorage 'ruptur_active_tenant' como fallback
  // síncrono do tenantId. Aqui mantemos o efeito (sem mutar no render).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = session?.access_token || null;
    window.__ruptur = window.__ruptur || {};
    window.__ruptur.auth = token ? { token, tenantId } : null;
  }, [session, tenantId]);

  const value = {
    // Estado
    session,
    user,
    tenant,
    tenants,
    tenantId,
    loading,
    authReady,

    // Auth flags
    isAuthenticated,
    isAdmin,
    isPlatformAdmin,

    // Actions
    signUp,
    signIn,
    signOut,
    switchTenant,
    fetchTenant,
    checkPlatformAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook de acesso ao contexto de autenticação
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return context;
}

export default AuthContext;
