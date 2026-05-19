import type { Page } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const documentWidth = Math.ceil(document.documentElement.scrollWidth);
    const bodyWidth = Math.ceil(document.body.scrollWidth);
    return {
      viewportWidth: window.innerWidth,
      widest: Math.max(documentWidth, bodyWidth),
    };
  });

  expect(metrics.widest).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

test.describe('Mobile YOps workspace', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;

  const userContent =
    'Capture the product onboarding flow, the proof points, and the open follow-up risks.';

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Mobile YOps E2E ${Date.now()}`));
    conversationId = await createTestConversation(request, projectId, 'Mobile YOps review');
    await createTestTurn(request, projectId, conversationId, 'user', userContent);
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  test('keeps Chat, YOps, and Result inspectable at 375x812', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/chat/${conversationId}`);

    await expect(page.getByText(userContent).first()).toBeVisible({ timeout: 10_000 });

    const switcher = page.getByRole('tablist', { name: 'Mobile workspace views' });
    await expect(switcher).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByTestId('mobile-workspace-sheet')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await page.getByRole('tab', { name: 'YOps' }).click();

    const yopsSheet = page.getByRole('dialog', { name: 'YOps' });
    await expect(yopsSheet).toBeVisible();
    await expect(page.getByRole('tab', { name: 'YOps' })).toHaveAttribute('aria-selected', 'true');
    await expect(yopsSheet.locator('.cm-editor')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('tab', { name: 'Result' }).click();

    const resultSheet = page.getByRole('dialog', { name: 'Result' });
    await expect(resultSheet).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Result' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(resultSheet.getByTestId('after-panel')).toBeVisible();
    await expect(resultSheet.getByTestId('workspace-action-bar')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('tab', { name: 'Chat' }).click();

    await expect(page.getByTestId('mobile-workspace-sheet')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
