import { test, expect } from './fixtures/auth.fixture';

test.describe('05 - Admin Users', () => {

  test('Deve listar os usuários e papeis corretamente no Admin', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/v0/admin');
    
    // A aba padrão deve ser Usuários e papéis, verifique se a tabela de equipe carrega
    await expect(page.getByText('MEMBRO', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('ROLE', { exact: true })).toBeVisible();

    // O texto 'Equipe · X membro(s)' deve aparecer
    await expect(page.getByText(/Equipe · \d+ membro/i)).toBeVisible({ timeout: 10000 });
  });
});
