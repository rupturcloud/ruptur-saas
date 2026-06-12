import { test, expect } from './fixtures/auth.fixture';

test.describe('04 - Admin e Wallet/Receita', () => {

  test('Deve bloquear usuários não autorizados no painel Admin (RBAC)', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Tenta acessar rota restrita no V2
    await page.goto('/v0/plataforma');
    await page.waitForLoadState('networkidle').catch(() => {});
    
    const currentURL = page.url();
    if (currentURL.includes('/plataforma')) {
       const deniedText = page.locator('text=Acesso').or(page.locator('text=Não autorizado')).or(page.locator('text=aguardando portagem'));
       await expect(deniedText.first()).toBeVisible();
    } else {
       // Foi chutado para dashboard ou 403
       expect(currentURL).toMatch(/\/dashboard|\/403/);
    }
  });

  test('Deve carregar os dados financeiros na Receita', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Navega diretamente para evitar falhas do .click + catch
    await page.goto('/v0/billing');
    await page.waitForURL('**/billing**', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    // Verifica exibição de "Receita"
    await expect(page.locator('h1:has-text("Receita")')).toBeVisible({ timeout: 15000 });
    
    // Deve mostrar "Planos" e "Créditos avulsos"
    await expect(page.locator('text=Planos').first()).toBeVisible();
    await expect(page.locator('text=Créditos avulsos').first()).toBeVisible();
  });

});
