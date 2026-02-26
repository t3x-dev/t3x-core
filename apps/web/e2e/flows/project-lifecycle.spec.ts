import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { generateProjectName } from '../fixtures/test-data-factory';

/**
 * Project Lifecycle E2E Tests
 *
 * Tests project CRUD operations from a user perspective.
 * Covers: create, navigate, delete, and error handling.
 */

test.describe('Project Lifecycle', () => {
  const projectIdsToCleanup: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of projectIdsToCleanup) {
      await cleanupProject(request, id).catch(() => {});
    }
  });

  // PL-01: Create project via API and verify it appears in the project list
  test('PL-01: Create project and verify in list', async ({ page, request }) => {
    const projectName = generateProjectName('PL-01');
    const { projectId } = await createTestProject(request, projectName);
    projectIdsToCleanup.push(projectId);

    await page.goto('/');
    // Wait for a concrete element instead of networkidle (#6)
    const projectEntry = page.locator(`text=${projectName}`);
    await expect(projectEntry).toBeVisible({ timeout: 15000 });
  });

  // PL-02: Delete project and verify removal from list
  test('PL-02: Delete project', async ({ request }) => {
    const { projectId } = await createTestProject(request, generateProjectName('PL-02'));
    // Register for cleanup in case DELETE fails (#5)
    projectIdsToCleanup.push(projectId);

    // Delete via API
    const deleteRes = await request.delete(`${API_BASE}/projects/${projectId}`);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);
    expect(deleteData.data.deleted).toBe(true);

    // Verify project no longer accessible
    const getRes = await request.get(`${API_BASE}/projects/${projectId}`);
    const getData = await getRes.json();
    expect(getData.success).toBe(false);
  });

  // PL-03: Navigate to project canvas
  test('PL-03: Navigate to project canvas', async ({ page, request }) => {
    const { projectId } = await createTestProject(request, generateProjectName('PL-03'));
    projectIdsToCleanup.push(projectId);

    await page.goto(`/project/${projectId}`);

    // Canvas should load
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible({ timeout: 15000 });
  });

  // PL-04: Non-existent project shows error message (#2)
  test('PL-04: Project not found shows error', async ({ page }) => {
    await page.goto('/project/proj_nonexistent_999');

    // Page should show a "Project not found" error message
    const errorHeading = page.locator('text=Project not found');
    await expect(errorHeading).toBeVisible({ timeout: 15000 });

    // Should also show a link back to projects
    const backLink = page.locator('text=Go to Projects');
    await expect(backLink).toBeVisible({ timeout: 5000 });
  });
});
