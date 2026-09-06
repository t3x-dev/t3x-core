import { randomUUID } from 'node:crypto';
import { getProjectIdRepoPath } from '../../src/domain/project/repoPath';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';


test('author revision preserves State and history, renders uploaded content, and retains a stale draft', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(8000);
  const { projectId } = await createTestProject(request, `Author introduction ${randomUUID().slice(0, 8)}`);
  try {
    // Render the repository's real brand asset for the upload, rather than a 1px placeholder.
    const assetPage = await page.context().newPage();
    await assetPage.goto('/favicon.svg', { waitUntil: 'domcontentloaded' });
    const png = await assetPage.locator('svg').screenshot();
    await assetPage.close();
    const owned = (await (await request.get(`${API_BASE}/projects/${projectId}`)).json()).data;
    expect(owned.project_id).toBe(projectId);
    const projectPath = getProjectIdRepoPath(owned.project_id);
    const first = await createTestCommitFromTrees(request, projectId, [{ key: 'services', slots: {}, children: [{ key: 'web', slots: { image: 'nginx:1.28-alpine', ports: ['127.0.0.1:8080:80'], restart: 'unless-stopped' }, children: [] }, { key: 'cache', slots: { image: 'redis:7-alpine', restart: 'unless-stopped' }, children: [] }] }]);
    const before = (await (await request.get(`${API_BASE}/commits/${encodeURIComponent(first)}/export?project_id=${projectId}&format=json`)).json()).data.content;
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.goto(`${projectPath}?view=overview&commit=${encodeURIComponent(first)}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Edit introduction', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit introduction' });
    await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill('A release definition maintained by our team.');
    await dialog.getByLabel('README', { exact: false }).fill('# Release guide\n\nReview the configuration before delivery.\n\n## Delivery checklist\n\n- Review service images and exposed ports.\n- Pin the revision before exporting.\n- Validate with the connected runtime.\n\n| Service | Role |\n| --- | --- |\n| web | Local web endpoint |\n| cache | Internal cache |\n\n## Project mark\n\n![Team mark](images/mark.png)');
    await dialog.getByText('Tags & images', { exact: true }).click();
    await dialog.getByLabel('Tags, one per line').fill('release\nmy-custom-tool');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: png });
    await dialog.getByLabel('Image description', { exact: true }).fill('Our team mark');
    await dialog.getByRole('combobox', { name: 'Avatar', exact: true }).selectOption('images/mark.png');
    await dialog.getByText('Tags & images', { exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Description', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('author-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('author-mobile.png') });
    const saved = page.waitForResponse((r) => r.url().includes('/presentation-revisions') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Save new revision' }).click();
    const response = await saved;
    expect(response.ok(), await response.text()).toBeTruthy();
    const revision = (await response.json()).data.commitDigest;
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(revision)));
    await expect(page.getByText('A release definition maintained by our team.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Release guide' })).toBeVisible();
    await expect(page.getByAltText('Our team mark', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('author-overview.png') });
    const after = (await (await request.get(`${API_BASE}/commits/${encodeURIComponent(revision)}/export?project_id=${projectId}&format=json`)).json()).data.content;
    expect(after).toBe(before);
    await page.goto(`${projectPath}?view=overview&commit=${encodeURIComponent(first)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('state-overview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit introduction', exact: true })).toHaveCount(0);
    expect((await (await request.get(`${API_BASE}/projects/${projectId}/commits/${encodeURIComponent(first)}/presentation`)).json()).data.presentation).toBeNull();
    await page.goto(`${projectPath}?view=overview&commit=${encodeURIComponent(revision)}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Edit introduction', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill('Keep my unsaved draft');
    const concurrent = await request.post(`${API_BASE}/projects/${projectId}/refs/main/presentation-revisions`, { data: { expectedHead: revision, presentation: { description: 'Other editor won' } } });
    expect(concurrent.ok(), await concurrent.text()).toBeTruthy();
    await dialog.getByRole('button', { name: 'Save new revision' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Keep my unsaved draft');
  } finally { await cleanupProject(request, projectId); }
});
