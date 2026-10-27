import { randomUUID } from 'node:crypto';
import { getProjectIdRepoPath } from '../../src/domain/project/repoPath';
import { expect, test } from '../fixtures/test';
import {
  API_BASE,
  cleanupProject,
  createTestCommitFromTrees,
  createTestProject,
} from '../fixtures/api-helpers';

test('repository README authoring preserves exact State and keeps cancelled edits local', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const { projectId } = await createTestProject(
    request,
    `Author introduction ${randomUUID().slice(0, 8)}`
  );
  try {
    const owned = (await (await request.get(`${API_BASE}/projects/${projectId}`)).json()).data;
    const projectPath = getProjectIdRepoPath(owned.project_id);
    const commit = await createTestCommitFromTrees(request, projectId, [
      {
        key: 'services',
        slots: {},
        children: [
          {
            key: 'web',
            slots: { image: 'nginx:1.28-alpine', ports: ['127.0.0.1:8080:80'] },
            children: [],
          },
        ],
      },
    ]);
    const before = (
      await (
        await request.get(
          `${API_BASE}/commits/${encodeURIComponent(commit)}/export?project_id=${projectId}&format=json`
        )
      ).json()
    ).data.content;

    await page.setViewportSize({ width: 1480, height: 900 });
    await page.goto(`${projectPath}?view=overview`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add README', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add repository README' });
    const readme =
      '# Release guide\n\nReview the configuration before delivery.\n\n## Delivery checklist\n\n- Review service images.\n- Pin the revision before exporting.\n\n<script>window.unsafeReadme = true</script>\n\n![Remote tracker](https://example.invalid/tracker.png)';
    await dialog.getByRole('textbox', { name: 'Repository README' }).fill(readme);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('author-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('author-mobile.png'),
    });
    await dialog.getByRole('button', { name: 'Save README', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Release guide' })).toBeVisible();
    expect(await page.evaluate(() => 'unsafeReadme' in window)).toBe(false);
    expect(await page.locator('img[src*="example.invalid"]').count()).toBe(0);

    const after = (
      await (
        await request.get(
          `${API_BASE}/commits/${encodeURIComponent(commit)}/export?project_id=${projectId}&format=json`
        )
      ).json()
    ).data.content;
    expect(after).toBe(before);

    await page.setViewportSize({ width: 1480, height: 900 });
    await page.getByRole('button', { name: 'Edit README', exact: true }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit repository README' });
    await editDialog
      .getByRole('textbox', { name: 'Repository README' })
      .fill('# Unsaved local edit');
    await editDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Release guide' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unsaved local edit' })).toHaveCount(0);
  } finally {
    await cleanupProject(request, projectId);
  }
});
