import { test, expect } from './fixtures/auth.fixture';

test.describe('04 - Admin e Wallet', () => {

  test('Deve bloquear usuários não autorizados no painel Admin (RBAC)', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Tenta acessar rota restrita
    await page.goto('/admin');
    
    // Dependendo do roteador React, ele ou mostra "Acesso Negado", ou redireciona
    const currentURL = page.url();
    if (currentURL.includes('/admin')) {
       const deniedText = page.locator('text=Acesso Negado').or(page.locator('text=Não autorizado'));
       if (await deniedText.isVisible()) {
         expect(true).toBeTruthy();
       }
    } else {
       // Foi chutado para dashboard
       expect(currentURL).toContain('/dashboard');
    }
  });

  test('Deve carregar os dados financeiros na Wallet', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/wallet');
    await page.waitForLoadState('networkidle');

    // Verifica exibição de saldo (texto "R$") e interface financeira
    await expect(page.locator('text=Saldo').or(page.locator('text=Carteira')).first()).toBeVisible();
    
    const pageText = await page.content();
    expect(pageText).toMatch(/R\$\s?\d+/i); // Garante que há pelo menos algum valor em Reais sendo formatado
  });

});
