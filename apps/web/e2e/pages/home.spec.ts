import { cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Home Page (Projects Dashboard) E2E Tests
 *
 * Tests the landing page where users see their project list.
 */

test.describe('Home Page', () => {
  // Collect project IDs for reliable cleanup even on test failure (#4)
  const projectIdsToCleanup: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of projectIdsToCleanup) {
      await cleanupProject(request, id).catch(() => {});
    }
  });

  // Home page loads without errors
  test('Page loads successfully', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    // Wait for nav instead of networkidle (#6)
    const navigation = page.locator('aside[aria-label="Chat navigation"]').first();
    await expect(navigation).toBeVisible({ timeout: 15000 });

    // Use shared filter for consistency (#11)
    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });

  // Navigation is present
  test('Navigation bar is visible', async ({ page }) => {
    await page.goto('/');

    const navigation = page.locator('aside[aria-label="Chat navigation"]').first();
    await expect(navigation).toBeVisible({ timeout: 15000 });
  });

  // Projects list displays created projects
  test('Projects list shows existing projects', async ({ page, request }) => {
    const projectName = `Home E2E ${Date.now()}`;
    const { projectId } = await createTestProject(request, projectName);
    projectIdsToCleanup.push(projectId);

    await page.goto('/');

    // Project should appear in the list
    const projectEntry = page.locator(`text=${projectName}`);
    await expect(projectEntry).toBeVisible({ timeout: 15000 });
  });

  // Click project navigates to canvas
  test('Click project navigates to canvas', async ({ page, request }) => {
    const projectName = `Home Nav E2E ${Date.now()}`;
    const { projectId } = await createTestProject(request, projectName);
    projectIdsToCleanup.push(projectId);

    await page.goto('/');

    // Click on the project in the sidebar to expand it
    const projectEntry = page.locator(`text=${projectName}`).first();
    await expect(projectEntry).toBeVisible({ timeout: 15000 });
    await projectEntry.click();

    // Click "Canvas" link to navigate to project canvas
    const canvasLink = page.locator('text=Canvas').first();
    await expect(canvasLink).toBeVisible({ timeout: 5000 });
    await canvasLink.click();

    // Should navigate to project canvas page
    await page.waitForURL(/\/project\//, { timeout: 15000 });
    expect(page.url()).toContain(projectId);
  });
});
