import { randomUUID } from 'node:crypto';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

test('original ecosystem starters are discoverable, filterable and importable at an exact version', async ({ page, request }, testInfo) => {
  const { projectId } = await createTestProject(request, `Starter catalog ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`/explore?view=discover&type=schemas&studioTarget=${projectId}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Curated schemas' })).toBeVisible();
    await expect(page.getByText('Review image-based service configuration before delivery.')).toBeVisible();
    for (const title of ['Product brief', 'Care checklist', 'Compose services'])
      await expect(page.getByRole('button', { name: `Explore ${title}`, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('starters-discover.png'), animations: 'disabled' });
    await page.getByRole('searchbox', { name: 'Search projects and schemas' }).fill('Care checklist');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/view=browse/);
    await expect(page.getByRole('button', { name: 'Explore Care checklist', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore Compose services', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('starters-browse.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Explore Care checklist', exact: true }).click();
    await expect(page).toHaveURL(/catalogName=t3x%2Fcare-checklist/);
    await expect(page.getByRole('heading', { name: 'Care checklist' })).toBeVisible();
    await expect(page.getByText('Apache-2.0').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Author README' })).toContainText('Rename the routine');
    await expect(page.getByRole('region', { name: 'Definition' })).toContainText('checklist');
    await page.screenshot({ path: testInfo.outputPath('starters-introduction.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Use Schema', exact: true }).click();
    await page.getByLabel('Destination project', { exact: true }).selectOption(projectId);
    await page.getByRole('button', { name: 'Add & open Studio', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Schema Studio', exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Available Schema sources' })).toContainText('Care checklist');
    const candidates = (await (await request.get(`${API_BASE}/projects/${projectId}/schema-studio/candidates`)).json()).data.items;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toMatchObject({ canonicalName: 't3x/care-checklist', version: '1.0.0' });
    await page.screenshot({ path: testInfo.outputPath('starters-studio.png'), animations: 'disabled' });
    await expect(page.getByRole('button', { name: 'Select source node checklist' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select source node items' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('starters-studio-mobile.png'), animations: 'disabled', fullPage: true });
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
