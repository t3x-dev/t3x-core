import { expect, test } from '../fixtures/test';
import { cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';

for (const viewport of [{ width: 1480, height: 900 }, { width: 390, height: 844 }]) {
  test(`legacy Leaf tour opens State delivery at ${viewport.width}px`, async ({ page, request }, testInfo) => {
    const { projectId } = await createTestProject(request, 'Delivery onboarding');
    try {
      const hash = await createTestCommitFromTrees(request, projectId, [{ key: 'release', slots: { title: 'Reviewed release' }, children: [] }]);
      await page.setViewportSize(viewport);
      const writes: string[] = [];
      page.on('request', (req) => { if (req.url().includes('/leaves') && !['GET', 'HEAD'].includes(req.method())) writes.push(req.method()); });
      await page.goto(`/project/${projectId}?view=canvas&introDemo=1&introDemoStage=leaf`, { waitUntil: 'networkidle' });
      await expect(page.getByText('Select this commit version', { exact: true })).toBeVisible();
      await page.locator(`[data-id="${hash}"] [data-intro-target="canvas-commit-node"]`).click();
      await expect(page.getByText('Open State for delivery', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /New Leaf|Create Leaf/ })).toHaveCount(0);
      const target = page.locator('[data-intro-target="state-snapshot-mode"]:visible');
      await expect.poll(async () => {
        const spot = await page.getByTestId('project-tour-spotlight').boundingBox();
        const box = await target.boundingBox();
        return spot && box ? Math.abs(spot.y - (box.y - 8)) : 999;
      }).toBeLessThan(2);
      const coach = (await page.getByTestId('project-tour-coach').boundingBox())!;
      const box = (await target.boundingBox())!;
      expect(coach.x >= box.x + box.width || coach.x + coach.width <= box.x || coach.y >= box.y + box.height || coach.y + coach.height <= box.y).toBe(true);
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`delivery-${viewport.width}.png`) });
      await page.locator('[data-intro-target="state-snapshot-mode"]:visible').click();
      await expect(page.getByRole('tab', { name: /^Overview/ })).toBeVisible();
      await expect(page.getByText('Open State for delivery', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
      expect(writes).toEqual([]);
    } finally { await cleanupProject(request, projectId); }
  });
}
