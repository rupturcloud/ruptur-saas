/**
 * Supabase Client — Front-end (Browser)
 * Singleton para todas as operações de auth e data do client-area
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://axrwlboyowoskdxeogba.supabase.co';
const supabaseAnonKey = 'JWT_REDACTED';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Evita erro de Web Locks em navegadores/extensões que disputam o token:
    // "Lock ... was released because another request stole it".
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
});

export default supabase;
