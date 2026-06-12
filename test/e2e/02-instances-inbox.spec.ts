import { test, expect } from './fixtures/auth.fixture';

test.describe('02 - Instâncias (Contas) e Inbox', () => {

  test('Deve listar instâncias de conexão e seus status', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Acessa o menu de Números (Instâncias de WhatsApp)
    await page.click('text=Números');
    // Para SPA, waitForURL não precisa esperar o evento 'load'
    await page.waitForURL('**/numbers**', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    // Aguarda o carregamento sumir se existir
    const spinner = page.locator('text=Carregando números');
    if (await spinner.isVisible()) {
      await spinner.waitFor({ state: 'hidden', timeout: 10000 });
    }

    // Espera por: estado vazio OU tabela com Status
    const emptyState = page.locator('text=Nenhum número conectado');
    const listState = page.locator('.inst-card').first();
    await expect(emptyState.or(listState)).toBeVisible({ timeout: 15000 });
  });

  test('Deve carregar histórico e conversas na Inbox', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Navega para a Inbox
    await page.click('text=Inbox').catch(() => page.goto('/v0/inbox'));
    await page.waitForURL('**/inbox**', { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Verifica painel de mensagens
    await expect(page.locator('.ibx-list').first()).toBeVisible({ timeout: 15000 });
    
  });
});
