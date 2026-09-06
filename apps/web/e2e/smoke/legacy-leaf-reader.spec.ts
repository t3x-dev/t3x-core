import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';
import fs from 'node:fs/promises';

test('legacy Leaf is read-only, exports saved content, and preserves its source revision', async ({ page, request }, testInfo) => {
  const { projectId } = await createTestProject(request, 'Legacy release brief');
  try {
    const hash = await createTestCommitFromTrees(request, projectId, [{ key: 'release', slots: { title: 'Archived release' }, children: [] }]);
    const created = await request.post(`${API_BASE}/leaves`, { data: { project_id: projectId, commit_hash: hash, type: 'article', title: 'Release briefing', constraints: [], config: {}, source: { type: 'user' } } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const leaf = (await created.json()).data;
    const output = 'Release briefing\n\nThis is the retained output, including the author’s final edits.';
    const edited = await request.patch(`${API_BASE}/leaves/${leaf.id}`, { data: { output } });
    expect(edited.ok(), await edited.text()).toBeTruthy();
    const writes: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/leaves') && !['GET', 'HEAD'].includes(req.method())) writes.push(req.method()); });
    await page.goto(`/project/${projectId}/leaf/${leaf.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Legacy Leaf archive' })).toBeVisible();
    await expect(page.getByText(output, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /generate|delete|learn|restore/i })).toHaveCount(0);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export record' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
    expect(exported.record.output).toBe(output);
    expect(exported.record.commit_hash).toBe(hash);
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.screenshot({ path: testInfo.outputPath('legacy-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('legacy-mobile.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'View source State' }).click();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(hash)));
    await page.goto(`/project/${projectId}?tab=outputs&leaf=missing`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Requested Leaf is unavailable in this project.', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
