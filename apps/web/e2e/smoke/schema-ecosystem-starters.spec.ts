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
    await expect(page.getByRole('heading', { name: 'Editor’s Choice' })).toBeVisible();
    await expect(page.getByText('Make a small service stack readable before you ship it.')).toBeVisible();
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
    await expect(page.getByRole('region', { name: 'Author README' })).toContainText('Rename the routine');
    await page.screenshot({ path: testInfo.outputPath('starters-introduction.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Add to Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Add & open Studio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sample preview', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Saved Studio candidates' })).toContainText('Care checklist');
    const candidates = (await (await request.get(`${API_BASE}/projects/${projectId}/schema-studio/candidates`)).json()).data.items;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toMatchObject({ canonicalName: 't3x/care-checklist', version: '1.0.0' });
    await page.screenshot({ path: testInfo.outputPath('starters-studio.png'), animations: 'disabled' });
    await expect(page.getByLabel('Sample validation')).toContainText('Matches selected definition');
    await expect(page.getByRole('region', { name: 'Sample preview', exact: true })).toContainText('Daily dog care');
    await page.getByRole('button', { name: 'Edit sample', exact: true }).click();
    const sample = page.getByRole('textbox', { name: 'Sample JSON' });
    await sample.fill(JSON.stringify({ checklist: { title: 'Daily dog care' }, items: { water: { done: false } } }, null, 2));
    await expect(page.getByLabel('Sample validation')).toContainText('Not checked');
    await page.getByRole('button', { name: 'Validate sample', exact: true }).click();
    await expect(page.getByLabel('Sample validation')).toContainText('Needs attention');
    await expect(page.getByRole('list', { name: 'Sample issues' })).toContainText('task');
    await page.screenshot({ path: testInfo.outputPath('studio-sample-repair.png'), animations: 'disabled' });
    await sample.fill(JSON.stringify({ checklist: { title: 'Daily dog care' }, items: { water: { task: 'Refresh water', done: false } } }, null, 2));
    await expect(page.getByLabel('Sample validation')).toContainText('Not checked');
    await page.getByRole('button', { name: 'Validate sample', exact: true }).click();
    await expect(page.getByLabel('Sample validation')).toContainText('Matches selected definition');
    await page.getByRole('button', { name: 'Hide editor', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('studio-sample-ready.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('studio-sample-mobile.png'), animations: 'disabled', fullPage: true });
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
