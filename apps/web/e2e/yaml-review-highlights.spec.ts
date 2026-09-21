import {
  cleanupProject,
  createTestCommitFromTrees,
  createTestProject,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

test('YAML review preserves multiline text and aligns split rows through the real API', async ({
  page,
  request,
}) => {
  const { projectId } = await createTestProject(request, `YAML highlight ${Date.now()}`);
  const before = 'Title\n  Keep the old wording.\n\tKeep  whitespace.\nEnd';
  const after = 'Title\n  Keep the new wording.\nAn inserted line.\n\tKeep  whitespace.\nEnd';
  const trees = (text: string) => [
    { key: 'note', slots: { text, z_after: 'Following field' }, children: [] },
  ];
  try {
    const base = await createTestCommitFromTrees(request, projectId, trees(before));
    const target = await createTestCommitFromTrees(request, projectId, trees(after), {
      parents: [base],
    });
    await page.goto(`/project/${projectId}/diff?base=${base}&target=${target}`);
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    const values = page.locator('[data-review-value]');
    await expect(values).toHaveCount(2);
    expect(await values.allTextContents()).toEqual([before, after]);
    const following = page.locator('.diff-yaml-line').filter({ hasText: 'z_after:' });
    await expect(following).toHaveCount(2);
    const left = await following.nth(0).boundingBox();
    const right = await following.nth(1).boundingBox();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(1);
    await page.getByRole('button', { name: 'Unified', exact: true }).click();
    await expect(values).toHaveCount(2);
    expect(await values.allTextContents()).toEqual([before, after]);
    await expect(values.locator('[class*="dy-removed-word"]')).toHaveText('old');
    const additions = await values.locator('[class*="dy-added-word"]').allTextContents();
    expect(additions).toContain('new');
    expect(additions.join('')).toContain('An inserted line.');
  } finally {
    await cleanupProject(request, projectId);
  }
});
