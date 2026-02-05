import { expect, test } from '@playwright/test';
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Error Scenarios E2E Tests
 *
 * Tests error handling and recovery across the application:
 * - Invalid routes show appropriate error pages
 * - Malformed data handling
 * - Network error display
 */

test.describe('Error Scenarios', () => {
  // ES-01: Invalid project ID shows error page
  test('ES-01: Invalid project shows error', async ({ page }) => {
    await page.goto('/project/proj_invalid_nonexistent');

    // Should show error message
    const errorMsg = page
      .locator('text=Project not found')
      .or(page.locator('text=/not found|error|404/i'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });

  // ES-02: Invalid conversation ID shows error
  test('ES-02: Invalid conversation shows error', async ({ page }) => {
    await page.goto('/project/proj_invalid/conversation/conv_invalid');

    const errorMsg = page
      .locator('text=/not found|error|404/i')
      .or(page.locator('text=Project not found'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });

  // ES-03: Invalid leaf ID shows error
  test('ES-03: Invalid leaf shows error', async ({ page }) => {
    await page.goto('/project/proj_invalid/leaf/leaf_invalid');

    const errorMsg = page
      .locator('text=/not found|error|404/i')
      .or(page.locator('text=Project not found'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });

  // ES-04: Invalid merge ID shows error
  test('ES-04: Invalid merge shows error', async ({ page }) => {
    await page.goto('/project/proj_invalid/merge/invalid_merge_id');

    const errorMsg = page
      .locator('text=/not found|error|failed/i')
      .or(page.locator('text=Project not found'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });

  // ES-05: 404 route shows fallback
  test('ES-05: Unknown route shows 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    // Next.js should show 404 page
    const notFound = page
      .locator('text=404')
      .or(page.locator('text=This page could not be found'))
      .or(page.locator('text=Not Found'));
    await expect(notFound.first()).toBeVisible({ timeout: 15000 });
  });

  // ES-06: Application recovers from navigation after error
  test('ES-06: Recovery after error', async ({ page }) => {
    // First visit an error page
    await page.goto('/project/proj_nonexistent_recovery');

    const errorMsg = page
      .locator('text=/not found|error|404/i')
      .or(page.locator('text=Project not found'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });

    // Navigate to home — should work normally
    await page.goto('/');
    const navigation = page.locator('nav').or(page.locator('[role="navigation"]')).first();
    await expect(navigation).toBeVisible({ timeout: 15000 });
  });

  // ES-07: Pages don't crash with console errors
  test('ES-07: Key pages render without crashes', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Visit multiple key routes
    const routes = ['/', '/insights', '/deploy'];

    for (const route of routes) {
      errors.length = 0;
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
      expect(
        unexpectedErrors,
        `Unexpected console errors on ${route}: ${unexpectedErrors.join(', ')}`
      ).toHaveLength(0);
    }
  });
});
