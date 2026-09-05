import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';

test('State and historical Commit export the selected exact value', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  const { projectId } = await createTestProject(request, 'Exact State exports');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const first = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v1' }, children: [] }], { message: 'Original configuration' });
    const latest = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v2' }, children: [] }], { message: 'Updated configuration' });
    await page.goto(`/project/${projectId}`);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(latest);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('state-export-desktop.png') });
    let downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const currentDownload = await downloadEvent;
    const currentBytes = await readFile((await currentDownload.path())!, 'utf8');
    expect(currentBytes).toContain('app:v2');
    expect(currentDownload.suggestedFilename()).toMatch(/\.yaml$/);
    await page.keyboard.press('Escape');
    await page.goto(`/project/${projectId}/history`);
    await page.getByText('Original configuration', { exact: true }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(first);
    await page.getByRole('radio', { name: 'JSON' }).check();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('state-export-mobile.png') });
    downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const historicalDownload = await downloadEvent;
    const historicalBytes = await readFile((await historicalDownload.path())!, 'utf8');
    const response = await request.get(`${API_BASE}/commits/${encodeURIComponent(first)}/export?project_id=${projectId}&format=json`);
    const { data } = await response.json();
    expect(historicalBytes).toBe(data.content);
    expect(JSON.stringify(load(historicalBytes))).toContain('app:v1');
    expect(historicalBytes).not.toContain('app:v2');
    expect(errors).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});
