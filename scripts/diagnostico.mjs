#!/usr/bin/env node
/**
 * Script de diagnóstico e setup inicial do Ruptur SaaS
 *
 * O que este script faz:
 * 1. Verifica quais tabelas estão faltando no Supabase
 * 2. Verifica provider_accounts (UAZAPI) configurados
 * 3. Verifica platform_admins
 * 4. Verifica memberships de tenants
 * 5. Reporta os problemas encontrados e instruções para corrigir
 *
 * Uso:
 *   node scripts/diagnostico.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const BOLD  = '\x1b[1m';
const RST   = '\x1b[0m';

function ok(msg)   { console.log(`${GREEN}✅ ${msg}${RST}`); }
function fail(msg) { console.log(`${RED}❌ ${msg}${RST}`); }
function warn(msg) { console.log(`${YEL}⚠️  ${msg}${RST}`); }
function info(msg) { console.log(`   ${msg}`); }
function head(msg) { console.log(`\n${BOLD}${msg}${RST}`); }

async function checkTable(name) {
  const { error } = await sb.from(name).select('id').limit(1);
  if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
    fail(`Tabela ${name} NÃO EXISTE no banco`);
    return false;
  }
  if (error) {
    warn(`Tabela ${name} — erro: ${error.message}`);
    return false;
  }
  ok(`Tabela ${name} existe`);
  return true;
}

async function main() {
  console.log(`\n${BOLD}🔍 Ruptur SaaS — Diagnóstico Completo${RST}`);
  console.log('='.repeat(50));

  // ── 1. Tabelas críticas ──────────────────────────────
  head('1. Tabelas do Banco de Dados');

  const criticalTables = [
    'tenants',
    'users',
    'user_tenant_memberships',
    'platform_admins',
    'provider_accounts',
    'instance_registry',
    'wallets',
    'wallet_transactions',
    'payments',
    'subscriptions',
    'webhook_events',
  ];

  const analyticsTables = [
    'analytics_events',
    'onboarding_progress',
  ];

  let allCriticalOk = true;
  for (const t of criticalTables) {
    const ok_ = await checkTable(t);
    if (!ok_) allCriticalOk = false;
  }

  console.log('\n  — Tabelas de Analytics (019_analytics_and_onboarding.sql) —');
  let analyticsOk = true;
  for (const t of analyticsTables) {
    const ok_ = await checkTable(t);
    if (!ok_) analyticsOk = false;
  }

  // Checar a view
  const { error: viewErr } = await sb.from('analytics_funnel_metrics').select('tenant_id').limit(1);
  if (viewErr?.code === 'PGRST205' || viewErr?.message?.includes('schema cache')) {
    fail('View analytics_funnel_metrics NÃO EXISTE');
    analyticsOk = false;
  } else if (!viewErr) {
    ok('View analytics_funnel_metrics existe');
  }

  if (!analyticsOk) {
    console.log(`\n${YEL}▶ CORREÇÃO NECESSÁRIA: Aplique a migration no Supabase Dashboard${RST}`);
    info('URL: https://supabase.com/dashboard/project/axrwlboyowoskdxeogba/sql/new');
    info('Arquivo: migrations/026_analytics_tables_fix.sql');
  }

  // ── 2. Provider Accounts (UAZAPI) ───────────────────
  head('2. Provider Accounts UAZAPI');
  const { data: providers, error: provErr } = await sb
    .from('provider_accounts')
    .select('id, label, server_url, account_kind, status, capacity_instances, used_instances');

  if (provErr) {
    fail(`Erro ao ler provider_accounts: ${provErr.message}`);
  } else if (!providers?.length) {
    fail('Nenhuma conta UAZAPI configurada — instâncias não podem ser criadas!');
    info('Acesse o painel Admin → Conectores → UAZAPI → Adicionar conta');
  } else {
    const active = providers.filter(p => p.status === 'active');
    ok(`${providers.length} conta(s) total, ${active.length} ativa(s)`);
    for (const p of providers) {
      const status = p.status === 'active' ? '✅' : '⚠️ ';
      info(`${status} [${p.account_kind}] ${p.label} — ${p.server_url} — ${p.used_instances}/${p.capacity_instances} instâncias`);
    }
    if (!active.length) {
      fail('Nenhuma conta UAZAPI está ATIVA — instâncias não podem ser criadas!');
    }
  }

  // ── 3. Platform Admins ───────────────────────────────
  head('3. Platform Admins (Superadmins)');
  const { data: admins, error: adminErr } = await sb
    .from('platform_admins')
    .select('id, user_id, email, status, permissions');

  if (adminErr) {
    fail(`Erro: ${adminErr.message}`);
  } else {
    ok(`${admins?.length || 0} superadmin(s) configurado(s)`);
    for (const a of admins || []) {
      const isActive = a.status === 'active';
      info(`${isActive ? '✅' : '⚠️ '} ${a.email} — status: ${a.status}`);
    }
  }

  // ── 4. Tenants ───────────────────────────────────────
  head('4. Tenants Cadastrados');
  const { data: tenants, error: tenErr } = await sb
    .from('tenants')
    .select('id, slug, name, email, plan, status')
    .order('created_at');

  if (tenErr) {
    fail(`Erro: ${tenErr.message}`);
  } else {
    ok(`${tenants?.length || 0} tenant(s) encontrado(s)`);
    for (const t of tenants || []) {
      const isActive = t.status === 'active';
      info(`${isActive ? '✅' : '⚠️ '} [${t.plan}] ${t.name} <${t.email}> — ${t.slug}`);
    }
  }

  // ── 5. Memberships ──────────────────────────────────
  head('5. Memberships (usuário → tenant)');
  const { data: memberships, error: memErr } = await sb
    .from('user_tenant_memberships')
    .select('user_id, tenant_id, role, tenants(name)');

  if (memErr) {
    fail(`Erro: ${memErr.message}`);
  } else {
    ok(`${memberships?.length || 0} vinculo(s) ativo(s)`);
    for (const m of memberships || []) {
      info(`user_id: ${m.user_id} → ${m.tenants?.name} [${m.role}]`);
    }
  }

  // ── 6. Resumo ────────────────────────────────────────
  head('6. Resumo Final');

  const issues = [];
  if (!analyticsOk) issues.push('Tabelas de analytics faltando → aplicar migration 026_analytics_tables_fix.sql');
  if (!allCriticalOk) issues.push('Tabelas críticas faltando → verificar migrations 001-025');

  if (!issues.length) {
    ok('Sistema em bom estado! Pronto para smoke test.');
  } else {
    fail(`${issues.length} problema(s) encontrado(s):`);
    issues.forEach((issue, i) => info(`${i + 1}. ${issue}`));
    console.log(`\n${BOLD}Como aplicar a migration de analytics:${RST}`);
    info('1. Abra: https://supabase.com/dashboard/project/axrwlboyowoskdxeogba/sql/new');
    info('2. Cole o conteúdo do arquivo: migrations/026_analytics_tables_fix.sql');
    info('3. Clique em "Run"');
    info('4. Reexecute este script para confirmar: node scripts/diagnostico.mjs');
  }

  console.log('');
}

main().catch(e => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
