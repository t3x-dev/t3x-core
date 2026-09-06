import fs from 'node:fs/promises';
import { expect, test } from '../fixtures/test';
import { API_BASE } from '../fixtures/api-helpers';

test('legacy prompts can be searched, previewed and exported without creating Leaves', async ({ page, request }, testInfo) => {
  const saved = { title: `Archive brief ${Date.now()}`, description: 'Retained release brief prompt.', category: 'business', leaf_type: 'article', system_prompt: 'Use only the reviewed release facts.', user_prompt: 'Summarize {{release}}.', variables: [{ name: 'release', description: 'Reviewed release', required: true }], tags: ['release'] };
  const response = await request.post(`${API_BASE}/templates`, { data: saved });
  expect(response.ok(), await response.text()).toBeTruthy();
  const template = (await response.json()).data;
  try {
    const writes: string[] = [];
    page.on('request', (req) => { if (/\/(leaves|templates)(\/|\?|$)/.test(req.url()) && !['GET', 'HEAD'].includes(req.method())) writes.push(req.method()); });
    await page.goto('/templates', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Product requirements brief' })).toBeVisible();
    await page.getByPlaceholder('Search templates...').fill(saved.title);
    await expect(page.getByRole('heading', { name: saved.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^(Use|Use Template|Create Template|Create Leaf)$/ })).toHaveCount(0);
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('archive-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Legacy prompt archive' }).scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('archive-mobile.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(saved.system_prompt, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /use|create/i })).toHaveCount(0);
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('prompt-mobile.png') });
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export as JSON' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
    expect(exported.template_id).toBe(template.template_id);
    expect(exported.system_prompt).toBe(saved.system_prompt);
    expect(exported.user_prompt).toBe(saved.user_prompt);
    expect(writes).toEqual([]);
  } finally { await request.delete(`${API_BASE}/templates/${template.template_id}`); }
});
