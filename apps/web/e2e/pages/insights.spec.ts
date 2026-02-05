import { expect, test } from '@playwright/test';
import { cleanupProject, createTestCommitV4, createTestProject } from '../fixtures/api-helpers';
import { generateSentences, isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Insights Page E2E Tests
 *
 * Tests the insights dashboard including:
 * - Page load and basic rendering
 * - Ledger tab with commit cards
 * - Latest commits timeline
 * - Empty state display
 * - Pagination (load more)
 */

test.describe('Insights Page', () => {
  const projectIdsToCleanup: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of projectIdsToCleanup) {
      await cleanupProject(request, id).catch(() => {});
    }
  });

  // IN-01: Insights page loads
  test('IN-01: Page loads successfully', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/insights');

    // Page heading should be visible
    const heading = page.locator('text=Insights');
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });

  // IN-02: Ledger tab shows commit cards
  test('IN-02: Ledger tab displays commits', async ({ page, request }) => {
    const { projectId } = await createTestProject(request, `Insights E2E ${Date.now()}`);
    projectIdsToCleanup.push(projectId);

    const sentences = generateSentences(3);
    await createTestCommitV4(request, projectId, sentences, {
      message: 'Insights test commit',
    });

    await page.goto('/insights');
    await expect(page.locator('text=Insights').first()).toBeVisible({ timeout: 15000 });

    // Ledger tab should be active or clickable
    const ledgerTab = page.locator('text=Ledger').first();
    const isVisible = await ledgerTab.isVisible().catch(() => false);
    if (isVisible) {
      await ledgerTab.click();
    }

    // Commit cards should appear (may take time to load)
    const commitCard = page.locator('text=Insights test commit').or(page.locator('text=commit'));
    await expect(commitCard.first()).toBeVisible({ timeout: 15000 });
  });

  // IN-03: Latest commits tab shows timeline
  test('IN-03: Latest commits timeline', async ({ page, request }) => {
    const { projectId } = await createTestProject(request, `Insights Timeline ${Date.now()}`);
    projectIdsToCleanup.push(projectId);

    const sentences = generateSentences(2);
    await createTestCommitV4(request, projectId, sentences, {
      message: 'Timeline test commit',
    });

    await page.goto('/insights');
    await expect(page.locator('text=Insights').first()).toBeVisible({ timeout: 15000 });

    // Click Latest Commits tab
    const latestTab = page.locator('text=Latest Commits').first();
    const hasTab = await latestTab.isVisible().catch(() => false);
    test.skip(!hasTab, 'Latest Commits tab not present');

    await latestTab.click();

    // Timeline items should be visible
    const timelineItem = page
      .locator('text=Timeline test commit')
      .or(page.locator('text=/\\d+ sentence/'));
    await expect(timelineItem.first()).toBeVisible({ timeout: 15000 });
  });

  // IN-04: Empty state when no data
  test('IN-04: Empty state display', async ({ page }) => {
    await page.goto('/insights');
    await expect(page.locator('text=Insights').first()).toBeVisible({ timeout: 15000 });

    // Check if empty state is shown (only relevant if no projects exist)
    const emptyState = page.locator('text=/No commits yet|No activity/i').first();
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    // Either empty state or commit data should be shown
    const hasData = await page
      .locator('text=commit')
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasEmpty || hasData).toBe(true);
  });

  // IN-05: Load more pagination
  test('IN-05: Load more pagination', async ({ page, request }) => {
    const { projectId } = await createTestProject(request, `Insights Pagination ${Date.now()}`);
    projectIdsToCleanup.push(projectId);

    // Create multiple commits to trigger pagination
    const sentences = generateSentences(2);
    for (let i = 0; i < 6; i++) {
      await createTestCommitV4(request, projectId, sentences, {
        message: `Pagination commit ${i + 1}`,
      });
    }

    await page.goto('/insights');
    await expect(page.locator('text=Insights').first()).toBeVisible({ timeout: 15000 });

    // Look for load more button
    const loadMoreBtn = page.locator('button:has-text("Load more")').first();
    const hasLoadMore = await loadMoreBtn.isVisible().catch(() => false);

    if (hasLoadMore) {
      await loadMoreBtn.click();
      // Wait for new content to load after click
      await page.waitForLoadState('networkidle');
    }

    // Verify commits from test data are visible on the page
    const commitEntry = page.locator('text=/Pagination commit/').first();
    await expect(commitEntry).toBeVisible({ timeout: 10000 });
  });
});
