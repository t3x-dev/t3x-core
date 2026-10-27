import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';

test('Overview shows author content and exact State on desktop and mobile', async ({ page, request }, testInfo) => {
  test.setTimeout(240_000);
  const { projectId } = await createTestProject(request, 'Evaluation schema');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const hash = await createTestCommitFromTrees(request, projectId, [{ key: 'evaluation', slots: { title: 'Evaluation suite', description: 'Define expected answers' }, children: [
      { key: 'prompts', slots: { task: 'Answer clearly and acknowledge uncertainty' }, children: [] },
      { key: 'cases', slots: { input: 'Hello', expected: 'Friendly response' }, children: [] },
      { key: 'assertions', slots: { format: 'Valid JSON', length: 'Under 100 words' }, children: [] },
    ] }], { message: 'Define evaluation suite' });
    const published = await request.post(`${API_BASE}/projects/${projectId}/commits/${hash}/presentation`, { data: {
      description: 'A shared definition for evaluation inputs and expectations.', tags: ['ai', 'evaluation', 'prompt-testing'],
      readme: '# Make expectations explicit\n\nKeep the definition close to the work. Describe what each case needs, then review changes before connecting your evaluation tool.\n\n## A typical workflow\n\n1. Define your prompts and cases.\n2. Review changes with your team.\n3. Pin the agreed version.\n\n## Team workflow reference\n\n| Case | Input | Expected |\n| --- | --- | --- |\n| Greeting | Hello | Friendly response |\n| Uncertainty | Unknown topic | Acknowledge uncertainty |\n\n## Connecting a runner\n\nUse the reviewed definition in your evaluation workflow.\n\n<script>window.unsafeReadme = true</script>\n\n![Remote tracker](https://example.invalid/tracker.png)',
    } });
    expect(published.ok()).toBeTruthy();
    await page.setViewportSize({ width: 1480, height: 1060 });
    await page.goto(`/project/${projectId}?view=overview&commit=${encodeURIComponent(hash)}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('state-overview')).toBeVisible();
    await page.getByRole('tab', { name: /Structure/ }).click();
    await expect(page.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(hash)));
    await page.getByRole('tab', { name: /Overview/ }).click();
    await expect(page.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');

    await expect(page.getByRole('heading', { name: 'Make expectations explicit' })).toBeVisible();
    expect(await page.evaluate(() => 'unsafeReadme' in window)).toBe(false);
    expect(await page.locator('img[src*="example.invalid"]').count()).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('overview-mobile.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1480, height: 1060 });
    const later = await createTestCommitFromTrees(request, projectId, [{ key: 'evaluation', slots: { title: 'Later version' }, children: [] }], { message: 'Advance State' });
    await page.goto(`/project/${projectId}?view=overview&commit=${encodeURIComponent(later)}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('state-overview')).toBeVisible();
    await expect(page.getByText('No README published for this revision.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make expectations explicit' })).toHaveCount(0);
    await page.goto(`/project/${projectId}?view=overview&commit=${encodeURIComponent(hash)}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Make expectations explicit' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
