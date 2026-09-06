import { randomUUID } from 'node:crypto';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

test('original ecosystem starters are discoverable, filterable and importable at an exact version', async ({ page, request }, testInfo) => {
  const { projectId } = await createTestProject(request, `Starter catalog ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`/project/${projectId}?tab=schemas&schemaView=discover`, { waitUntil: 'networkidle' });
    for (const title of ['Product brief', 'Care checklist', 'Compose services'])
      await expect(page.getByRole('button', { name: `Explore ${title} 1.0.0`, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('starters-discover.png'), animations: 'disabled' });
    await page.getByRole('textbox', { name: 'Search definitions' }).fill('Care checklist');
    await page.getByRole('textbox', { name: 'Search definitions' }).press('Enter');
    await expect(page).toHaveURL(/schemaView=browse/);
    await expect(page.getByRole('button', { name: 'Explore Care checklist 1.0.0', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore Compose services 1.0.0', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('starters-browse.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Explore Care checklist 1.0.0', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Apache-2.0');
    await page.getByRole('button', { name: 'Add to Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Add & open Studio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Definition preview', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Saved Studio candidates' })).toContainText('Care checklist');
    const candidates = (await (await request.get(`${API_BASE}/projects/${projectId}/schema-studio/candidates`)).json()).data.items;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toMatchObject({ canonicalName: 't3x/care-checklist', version: '1.0.0' });
    await page.screenshot({ path: testInfo.outputPath('starters-studio.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
