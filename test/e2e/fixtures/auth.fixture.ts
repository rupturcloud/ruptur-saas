import { test as base, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

// Carrega as credenciais de teste
const USER_EMAIL = process.env.TEST_USER_EMAIL || 'test@ruptur.cloud';
const USER_PASSWORD = process.env.TEST_USER_PASSWORD || '123456';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // 1. Acessar a página de login
    await page.goto('/login');
    
    // Opcional: interceptar APIs se precisar ignorar limites de taxa (rate limit)
    // await page.route('**/auth/v1/token?grant_type=password', route => route.continue());

    // 2. Preencher credenciais
    // Aguardar seletor comum em telas de auth Supabase/React
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', USER_EMAIL);
    await page.fill('input[type="password"]', USER_PASSWORD);
    
    // 3. Submeter form
    await page.click('button[type="submit"]');

    // 4. Aguardar redirecionamento para o dashboard
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    
    // Repassa a página autenticada para o teste
    await use(page);
  },
});

export { expect };
