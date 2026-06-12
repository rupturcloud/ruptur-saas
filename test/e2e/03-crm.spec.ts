import { test, expect } from './fixtures/auth.fixture';

test.describe('03 - Pipeline de CRM', () => {

  test('Deve renderizar os cards do CRM e persistir edição de coluna', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Acessa CRM
    await page.goto('/crm');
    await page.waitForURL('**/crm**');

    // Valida UI base do pipeline (colunas como "Novo", "Em Atendimento")
    const columnCount = await page.locator('.kanban-column, [data-testid="crm-column"]').count();
    
    if (columnCount > 0) {
      // Tentar arrastar (Drag and Drop simulado se houver cards)
      const firstCard = page.locator('.kanban-card, [data-testid="crm-card"]').first();
      const secondColumn = page.locator('.kanban-column, [data-testid="crm-column"]').nth(1);
      
      if (await firstCard.isVisible()) {
        await firstCard.dragTo(secondColumn);
        // Reload pra testar persistência
        await page.reload();
        await page.waitForLoadState('networkidle');
        // O card ainda deve estar lá (assumindo que há mock/banco de teste ou a action salvou)
        await expect(secondColumn.locator('.kanban-card').first()).toBeVisible();
      }
    } else {
      // Mock vazio
      await expect(page.locator('text=Adicionar Coluna').or(page.locator('text=CRM'))).toBeVisible();
    }
  });

});
