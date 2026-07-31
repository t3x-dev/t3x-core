import {
  cleanupProject,
  createTestCommitFromTrees,
  createTestProject,
} from '../fixtures/api-helpers';
import { PROMPT_DIFF_DEMO } from '../fixtures/open-source-demo-datasets';
import { expect, test } from '../fixtures/test';

test('State opens History and Commit with its inline parent Diff and a complete return path', async ({
  page,
  request,
}) => {
  const { projectId } = await createTestProject(request, `Repository navigation ${Date.now()}`);

  try {
    const baseHash = await createTestCommitFromTrees(request, projectId, PROMPT_DIFF_DEMO.base, {
      branch: 'main',
      message: 'Repository navigation baseline',
      parents: [],
    });
    const targetHash = await createTestCommitFromTrees(
      request,
      projectId,
      PROMPT_DIFF_DEMO.target,
      {
        branch: 'main',
        message: 'Repository navigation revision',
        parents: [baseHash],
      }
    );

    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`console.error: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/api/v1/')) {
        browserErrors.push(`api ${response.status()}: ${response.request().method()} ${response.url()}`);
      }
    });

    await page.goto(`/project/${projectId}`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Repository navigation/ })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: /Snapshot/ })).toBeVisible();
    await expect(page.getByLabel('Branch focus')).toHaveValue('main');
    await expect(page.getByText('Repository navigation revision', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Commit History', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Branch filter' })).toHaveValue('main');

    const targetRow = page.locator(`[data-commit-hash="${targetHash}"]`);
    await expect(targetRow).toContainText('Repository navigation revision');
    await targetRow.click();

    await expect(
      page.getByRole('heading', { name: 'Repository navigation revision', exact: true })
    ).toBeVisible({ timeout: 15_000 });
    const inlineDiff = page.getByRole('region', { name: 'T3X Diff' });
    await expect(inlineDiff).toBeVisible();
    await expect(inlineDiff).toContainText('Parent → Selected commit');
    await expect(inlineDiff).toContainText('3 field changes');
    await expect(inlineDiff.getByRole('treeitem', { name: /good_reply added/ })).toBeVisible();

    await page.getByRole('button', { name: 'Back to History' }).click();
    await expect(page.getByRole('heading', { name: 'Commit History', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Branch filter' })).toHaveValue('main');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('tab', { name: /Snapshot/ })).toBeVisible();

    expect(browserErrors, browserErrors.join('\n')).toEqual([]);
  } finally {
    await cleanupProject(request, projectId).catch(() => {});
  }
});
