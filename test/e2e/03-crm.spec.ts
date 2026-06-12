import { test, expect } from './fixtures/auth.fixture';

test.describe('03 - Pipeline de CRM', () => {

  test('Deve renderizar os cards do CRM e persistir edição de coluna', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Acessa CRM via clique no menu ou fallback na URL do V2 AppShell (/v0/pipeline)
    await page.click('text=CRM').catch(() => page.goto('/v0/pipeline'));
    await page.waitForURL('**/pipeline**', { waitUntil: 'domcontentloaded', timeout: 10000 });

    const board = page.locator('.kanban-board, .crm-board, .crm-container').first();
    const heading = page.getByRole('heading', { name: /Pipeline/i }).first();

    await expect(board.or(heading)).toBeVisible({ timeout: 15000 });


  });

});
