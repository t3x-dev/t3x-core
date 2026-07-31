import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Organization repository directory E2E tests.
 *
 * These assertions intentionally follow the current organization-first entry
 * experience instead of the retired chat-sidebar home page.
 */

test.describe('Home Page', () => {
  // Collect project IDs for reliable cleanup even on test failure (#4)
  const projectIdsToCleanup: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of projectIdsToCleanup) {
      await cleanupProject(request, id).catch(() => {});
    }
  });

  // Organization directory loads without errors
  test('Page loads successfully', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 't3x-dev', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Use shared filter for consistency (#11)
    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });

  // Organization navigation is present
  test('Navigation bar is visible', async ({ page }) => {
    await page.goto('/');

    const navigation = page.getByRole('navigation', { name: 'Organization navigation' });
    await expect(navigation).toBeVisible({ timeout: 15000 });
    await expect(navigation.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/t3x-dev/settings'
    );
    await expect(page.getByRole('link', { name: 'New repository' })).toHaveAttribute(
      'href',
      '/t3x-dev/new'
    );
    await expect(page.getByRole('button', { name: 'Refresh repositories' })).toBeVisible();
  });

  // Projects list displays created projects
  test('Projects list shows existing projects', async ({ page, request }) => {
    const projectName = `Home E2E ${Date.now()}`;
    const { projectId } = await createTestProject(request, projectName);
    projectIdsToCleanup.push(projectId);

    await page.goto('/');

    // Project should appear in the list
    const projectEntry = page.locator('article').filter({ hasText: projectName }).first();
    await expect(projectEntry).toBeVisible({ timeout: 15000 });
  });

  test('Click repository navigates to its organization-scoped State page', async ({
    page,
    request,
  }) => {
    const projectName = `Home Nav E2E ${Date.now()}`;
    const { projectId } = await createTestProject(request, projectName);
    projectIdsToCleanup.push(projectId);

    await page.goto('/');
    const projectCard = page.locator('article').filter({ hasText: projectName }).first();
    await projectCard.getByRole('link').click();

    await expect(page).toHaveURL(/\/t3x-dev\/home-nav-e2e$/);
    await expect(page.getByRole('tab', { name: /Snapshot/ })).toBeVisible({
      timeout: 15000,
    });
  });

  test('Create, find, rename, and delete a repository through the UI', async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString(36);
    const projectName = `Release UI ${suffix}`;
    const renamedProjectName = `Release Renamed ${suffix}`;

    await page.goto('/');
    await page.getByRole('link', { name: 'New repository' }).click();
    await expect(page.getByRole('heading', { name: 'Create a new repository' })).toBeVisible();

    await page.getByLabel('Repository name').fill(projectName);
    await page.getByLabel('Description').fill('Full-stack E2E repository lifecycle.');

    const createdResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/projects') &&
        response.ok()
    );
    await page.getByRole('button', { name: 'Create repository' }).click();
    const createdBody = await (await createdResponse).json();
    const projectId = createdBody.data.project_id as string;
    projectIdsToCleanup.push(projectId);

    await expect(page).toHaveURL(new RegExp(`/t3x-dev/release-ui-${suffix}$`));
    await expect(page.getByRole('tab', { name: /Snapshot/ })).toBeVisible({
      timeout: 15000,
    });

    await page.goto('/');
    await page.getByPlaceholder('Find a repository...').fill(projectName);
    const repositoryCard = page.locator('article').filter({ hasText: projectName }).first();
    await expect(repositoryCard).toBeVisible();

    await repositoryCard.getByRole('button', { name: `Rename repository ${projectName}` }).click();
    await page.getByLabel('Repository name').fill(renamedProjectName);
    const renamedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith(`/api/v1/projects/${projectId}`) &&
        response.ok()
    );
    await page.getByRole('button', { name: 'Save' }).click();
    await renamedResponse;
    await expect(page.getByText(renamedProjectName).first()).toBeVisible();

    await page.getByPlaceholder('Find a repository...').fill('');
    const renamedCard = page.locator('article').filter({ hasText: renamedProjectName }).first();
    await renamedCard
      .getByRole('button', { name: `Delete repository ${renamedProjectName}` })
      .click();
    const deletedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().endsWith(`/api/v1/projects/${projectId}`) &&
        response.ok()
    );
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await deletedResponse;
    await expect(page.getByText(renamedProjectName)).toHaveCount(0);

    const getDeleted = await request.get(`${API_BASE}/projects/${projectId}`);
    expect(getDeleted.status()).toBe(404);
  });

  test('Failed initial load is recoverable and is not presented as an empty organization', async ({
    page,
  }) => {
    await page.route('**/api/v1/projects?**', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: "Couldn't load repositories" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('— repos')).toBeVisible();
    await expect(page.getByText('— commits')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No repositories yet' })).toHaveCount(0);

    await page.unroute('**/api/v1/projects?**');
    const recovered = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/v1/projects?') &&
        response.ok()
    );
    await page.getByRole('button', { name: 'Retry' }).click();
    await recovered;

    await expect(
      page.getByRole('heading', { name: "Couldn't load repositories" })
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
  });
});
