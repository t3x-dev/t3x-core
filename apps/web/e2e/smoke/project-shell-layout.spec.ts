import { expect, test } from '../fixtures/test';
import { cleanupProject, createTestProject } from '../fixtures/api-helpers';

test('shared project shell keeps navigation separate from long project names', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const projectName = 'Long-project-name-for-infrastructure-and-evaluation-configuration';
  const { projectId } = await createTestProject(request, projectName);
  try {
    for (const width of [1480, 1200, 1000, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/project/${projectId}`, { waitUntil: 'networkidle' });
      const nav = page.getByRole('navigation', { name: 'Project views' });
      const title = page.getByRole('heading', { name: projectName, exact: true });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Outputs' })).toHaveCount(0);
      // The Project ID route remounts the shell at its canonical repository address.
      await expect(page).toHaveURL(new RegExp(`/${projectName}$`));
      await expect(title).toBeVisible();
      const titleBox = await title.boundingBox();
      const navBox = await nav.boundingBox();
      expect(titleBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(navBox!.y >= titleBox!.y + titleBox!.height || navBox!.x >= titleBox!.x + titleBox!.width).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`shell-${width}.png`) });
      await nav.getByRole('link', { name: 'Workspace', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Workspace', exact: true })).toHaveAttribute('aria-current', 'page');
      if (width === 1480) await page.screenshot({ path: testInfo.outputPath('workspace-shell.png') });
    }
  } finally { await cleanupProject(request, projectId); }
});
