import { expect, test } from '@playwright/test';

// No fixture writes: retired pages must terminate even without an existing repository.
const retiredPaths = [
  '/templates/archive',
  '/templates/archive/extra',
  '/project/proj_retired/outputs',
  '/project/proj_retired/outputs/extra',
  '/project/proj_retired?tab=outputs&leaf=old',
  '/project/proj_retired/leaf',
  '/project/proj_retired/leaf/old',
  '/project/proj_retired/leaf/old/extra',
  '/chat/project/proj_retired/leaf',
  '/chat/project/proj_retired/leaf/old',
  '/chat/project/proj_retired/leaf/old/extra',
  '/owner/retired/outputs',
  '/owner/retired/outputs/extra',
  '/owner/retired/leaf/old',
  '/owner/retired?tab=outputs&leaf=old',
];

for (const path of retiredPaths) {
  test(`retired Legacy URL ${path} shows not found`, async ({ page }) => {
    const archiveReads: string[] = [];
    page.on('request', (request) => {
      if (/\/(?:leaves|templates)(?:\/|\?|$)/.test(request.url()) && request.resourceType() === 'fetch') {
        archiveReads.push(request.url());
      }
    });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Legacy Leaf archive' })).toHaveCount(0);
    expect(archiveReads).toEqual([]);
  });
}
