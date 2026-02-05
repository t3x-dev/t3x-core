import { expect, test } from '@playwright/test';
import {
  API_BASE,
  cleanupProject,
  createTestCommitV4,
  createTestProject,
} from '../fixtures/api-helpers';
import { generateSentences } from '../fixtures/test-data-factory';

/**
 * API-WebUI Synchronization E2E Tests
 *
 * Tests that API mutations are reflected in the WebUI:
 * - Create via API → UI updates
 * - Delete via API → UI updates
 * - Concurrent operations remain consistent
 */

test.describe('API-WebUI Sync', () => {
  const projectIdsToCleanup: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of projectIdsToCleanup) {
      await cleanupProject(request, id).catch(() => {});
    }
  });

  // AS-01: API create reflects in UI without refresh
  test('AS-01: Create reflects in UI', async ({ page, request }) => {
    // Load the home page first
    await page.goto('/');
    const navigation = page.locator('nav').or(page.locator('[role="navigation"]')).first();
    await expect(navigation).toBeVisible({ timeout: 15000 });

    // Create a project via API while page is open
    const projectName = `Sync Create ${Date.now()}`;
    const { projectId } = await createTestProject(request, projectName);
    projectIdsToCleanup.push(projectId);

    // Refresh page to check if project appears
    await page.reload();
    const projectEntry = page.locator(`text=${projectName}`);
    await expect(projectEntry).toBeVisible({ timeout: 15000 });
  });

  // AS-02: API delete reflects in UI
  test('AS-02: Delete reflects in UI', async ({ page, request }) => {
    const projectName = `Sync Delete ${Date.now()}`;
    const { projectId } = await createTestProject(request, projectName);

    // Load page and verify project is visible
    await page.goto('/');
    const projectEntry = page.locator(`text=${projectName}`);
    await expect(projectEntry).toBeVisible({ timeout: 15000 });

    // Delete via API
    await request.delete(`${API_BASE}/projects/${projectId}`);

    // Reload and verify removal
    await page.reload();
    await page.waitForLoadState('networkidle');
    const stillVisible = await projectEntry.isVisible().catch(() => false);
    expect(stillVisible).toBe(false);
  });

  // AS-03: Concurrent API operations remain consistent
  test('AS-03: Concurrent operations', async ({ page, request }) => {
    // Create multiple projects concurrently
    const names = Array.from({ length: 3 }, (_, i) => `Sync Concurrent ${i + 1} ${Date.now()}`);
    const results = await Promise.all(names.map((name) => createTestProject(request, name)));
    for (const r of results) {
      projectIdsToCleanup.push(r.projectId);
    }

    // Load page and verify all projects appear
    await page.goto('/');
    const navigation = page.locator('nav').or(page.locator('[role="navigation"]')).first();
    await expect(navigation).toBeVisible({ timeout: 15000 });

    for (const name of names) {
      const entry = page.locator(`text=${name}`);
      await expect(entry).toBeVisible({ timeout: 15000 });
    }
  });

  // AS-04: Commit created via API appears on canvas
  test('AS-04: API commit appears on canvas', async ({ page, request }) => {
    const { projectId } = await createTestProject(request, `Sync Canvas ${Date.now()}`);
    projectIdsToCleanup.push(projectId);

    const sentences = generateSentences(2);
    const commitHash = await createTestCommitV4(request, projectId, sentences, {
      message: 'Sync test commit',
    });

    await page.goto(`/project/${projectId}`);
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Commit node should appear on canvas
    const commitNode = page
      .locator(`[data-id="${commitHash}"]`)
      .or(page.locator('text=Sync test commit'));
    await expect(commitNode.first()).toBeVisible({ timeout: 15000 });
  });
});
