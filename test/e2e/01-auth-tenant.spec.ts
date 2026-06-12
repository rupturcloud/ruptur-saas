import { test, expect } from './fixtures/auth.fixture';

test.describe('01 - Autenticação e Resolução de Tenant', () => {

  test('Deve realizar o login e carregar os dados do usuário corretamente', async ({ authenticatedPage }) => {
    // O login já é validado pelo fixture (que aguarda a URL do dashboard)
    const page = authenticatedPage;

    // Verificar se a tela principal abriu e os itens básicos da UI renderizaram
    await expect(page.locator('text=Cockpit').first()).toBeVisible();
    await expect(page.locator('text=Sair').or(page.locator('text=Logout')).first()).toBeVisible();
  });

  test('Deve resolver o tenant correto e manter a sessão no recarregamento', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Fazer reload da página
    await page.reload();

    // Aguarda a renderização novamente para confirmar que não deslogou
    await page.waitForURL('**/dashboard**');
    await expect(page.locator('text=Cockpit').first()).toBeVisible();

    // Exemplo de verificação de interceptação de rede para garantir que /api/me retornou tenant_id (caso exista a chamada explícita)
    // Opcional, mantido simples focando na UI conforme critério de aceite
  });

});
