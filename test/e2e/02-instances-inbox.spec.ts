import { test, expect } from './fixtures/auth.fixture';

test.describe('02 - Instâncias (Contas) e Inbox', () => {

  test('Deve listar instâncias de conexão e seus status', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Acessa o menu de Instâncias / Conexões / Canais
    await page.click('text=Instâncias', { trial: true }).catch(() => page.click('text=Conexões'));
    await page.waitForURL('**/instances**', { timeout: 10000 }).catch(() => {});

    // Verifica a listagem
    const hasInstances = await page.locator('.instance-card, [data-testid="instance-item"]').count() > 0;
    if (hasInstances) {
      await expect(page.locator('text=Status').first()).toBeVisible();
    } else {
      // Estado vazio
      await expect(page.locator('text=Nenhuma instância encontrada').or(page.locator('text=Adicionar'))).toBeVisible();
    }
  });

  test('Deve carregar histórico e conversas na Inbox', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Navega para a Inbox
    await page.click('text=Inbox').catch(() => page.goto('/inbox'));
    await page.waitForURL('**/inbox**', { timeout: 10000 });

    // Verifica painel de mensagens
    await expect(page.locator('.message-list, [data-testid="inbox-sidebar"]')).toBeVisible();
    
    // Confirma renderização inicial limpa
    // await expect(page.locator('text=Selecione uma conversa')).toBeVisible();
  });

});
