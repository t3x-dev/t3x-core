import { expect, test } from '../fixtures/test';
import { cleanupProject, createTestProject } from '../fixtures/api-helpers';

test('shared project shell keeps navigation separate from long project names', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const { projectId } = await createTestProject(request, 'Long project name for infrastructure and evaluation configuration');
  try {
    for (const width of [1480, 1200, 1000, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/project/${projectId}`, { waitUntil: 'networkidle' });
      const nav = page.getByRole('navigation', { name: 'Project views' });
      const title = page.getByRole('heading', { name: 'Long project name for infrastructure and evaluation configuration', exact: true });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Outputs' })).toHaveCount(0);
      const titleBox = await title.boundingBox();
      const navBox = await nav.boundingBox();
      expect(titleBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(navBox!.y >= titleBox!.y + titleBox!.height || navBox!.x >= titleBox!.x + titleBox!.width).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`shell-${width}.png`) });
      await nav.getByRole('link', { name: 'Workspaces' }).click();
      await expect(page.getByRole('link', { name: 'Workspaces', exact: true })).toHaveAttribute('aria-current', 'page');
      if (width === 1480) await page.screenshot({ path: testInfo.outputPath('workspace-shell.png') });
    }
    await page.goto(`/project/${projectId}?tab=outputs`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation', { name: 'Project views' })).toBeVisible();
    await expect(page.getByText('No legacy Leaves saved.', { exact: true })).toBeVisible();
  } finally { await cleanupProject(request, projectId); }
});
