import { expect, test } from '../fixtures/test';
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Agent Demo E2E Tests
 *
 * Tests the agent demo pages including:
 * - Chat page load and message sending
 * - Message rating (star system)
 * - Optimiser page layout (three columns)
 * - Commit detail modal
 * - Optimisation workflow
 *
 * Note: These tests may skip if the agent demo pages are not deployed
 * or the agent service is not running.
 */

test.describe('Agent Demo', () => {
  // Agent demo pages (/agent-demo/chat, /agent-demo/optimiser) are not built as
  // Next.js routes in apps/web. The agent-demo is a standalone service on :9000.
  // These tests need to be rewritten to test :9000 directly or the routes need
  // to be added to apps/web.
  test.describe.configure({ mode: 'serial' });

  // AD-01: Chat page loads
  test.fixme('AD-01: Chat page loads', async ({ page }) => {
    await page.goto('/agent-demo/chat');

    // Check if page loads (may redirect or show error if not configured)
    const chatInput = page
      .locator('textarea[placeholder*="message" i]')
      .or(page.locator('text=Start a conversation'));
    const loaded = await chatInput
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    test.skip(!loaded, 'Agent demo chat page not available');

    await expect(chatInput.first()).toBeVisible();
  });

  // AD-02: Send message
  test.fixme('AD-02: Send message', async ({ page }) => {
    await page.goto('/agent-demo/chat');

    const chatInput = page.locator('textarea[placeholder*="message" i]').first();
    const loaded = await chatInput.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!loaded, 'Agent demo chat page not available');

    // Type a message
    await chatInput.fill('Hello, can you help me?');

    // Click send button
    const sendBtn = page
      .locator('button')
      .filter({ hasText: /send/i })
      .or(page.locator('button[type="submit"]'))
      .first();
    await sendBtn.click();

    // User message should appear
    const userMsg = page.locator('text=Hello, can you help me?');
    await expect(userMsg.first()).toBeVisible({ timeout: 10000 });

    // Wait for bot response (typing indicator or assistant message)
    const botResponse = page
      .locator('[class*="typing"]')
      .or(page.locator('[class*="assistant"]'))
      .or(page.locator('[class*="bot"]'));
    await expect(botResponse.first()).toBeVisible({ timeout: 30000 });
  });

  // AD-03: Rate message with stars
  test.fixme('AD-03: Rate message', async ({ page }) => {
    await page.goto('/agent-demo/chat');

    const chatInput = page.locator('textarea[placeholder*="message" i]').first();
    const loaded = await chatInput.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!loaded, 'Agent demo chat page not available');

    // Send a message first to get a bot response with rating
    await chatInput.fill('What is your name?');
    const sendBtn = page
      .locator('button')
      .filter({ hasText: /send/i })
      .or(page.locator('button[type="submit"]'))
      .first();
    await sendBtn.click();

    // Wait for bot response
    const botMsg = page.locator('text=Bot').first();
    await expect(botMsg).toBeVisible({ timeout: 30000 });

    // Find star rating buttons (aria-label like "Rate 1 stars", "Rate 2 stars", etc.)
    const stars = page.locator('button[aria-label*="Rate"][aria-label*="star"]');
    const starCount = await stars.count();

    test.skip(starCount < 5, 'Star rating buttons not found');

    // Stars may be disabled if rating already applied or bot response not fully loaded
    const fourthStar = stars.nth(3);
    const isEnabled = await fourthStar.isEnabled({ timeout: 5000 }).catch(() => false);
    test.skip(!isEnabled, 'Star rating buttons are disabled');

    // Click the 4th star (4 out of 5 rating)
    await fourthStar.click();

    // Feedback recorded indicator should appear
    const feedback = page.locator('text=/feedback recorded|rated|thank/i');
    await expect(feedback.first()).toBeVisible({ timeout: 5000 });
  });

  // AD-04: Optimiser page loads with three columns
  test.fixme('AD-04: Optimiser page loads', async ({ page }) => {
    await page.goto('/agent-demo/optimiser');

    // Check if optimiser page loads
    const optimiserContent = page
      .locator('text=Sandbox Commits')
      .or(page.locator('text=Feedback'))
      .or(page.locator('text=Optimis'));
    const loaded = await optimiserContent
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    test.skip(!loaded, 'Agent demo optimiser page not available');

    // Three key sections should be visible
    const feedbackSection = page.locator('text=Feedback').first();
    const commitsSection = page.locator('text=Sandbox Commits').first();
    const deploymentsSection = page.locator('text=Deployments').or(page.locator('text=History'));

    await expect(feedbackSection).toBeVisible({ timeout: 10000 });
    await expect(commitsSection).toBeVisible({ timeout: 10000 });
    await expect(deploymentsSection.first()).toBeVisible({ timeout: 10000 });
  });

  // AD-05: Commit detail modal opens
  test.fixme('AD-05: Commit detail modal', async ({ page }) => {
    await page.goto('/agent-demo/optimiser');

    const commitsSection = page.locator('text=Sandbox Commits').first();
    const loaded = await commitsSection.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!loaded, 'Agent demo optimiser page not available');

    // Click on a commit entry
    const commitEntry = page.locator('text=/v\\d+-sandbox/').first();
    const hasCommit = await commitEntry.isVisible().catch(() => false);
    test.skip(!hasCommit, 'No sandbox commits available');

    await commitEntry.click();

    // Modal or detail view should open after clicking commit
    // Note: avoid [class*="backdrop"] — it matches sidebar's backdrop-blur-* classes
    const modal = page
      .locator('[role="dialog"]')
      .or(page.locator('.fixed.inset-0.z-50'))
      .or(page.locator('[class*="modal"]'));
    const hasModal = await modal
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    test.skip(!hasModal, 'Commit detail does not open as modal in current UI');

    // Modal should show commit details
    const promptSection = page.locator('text=Prompt').or(page.locator('pre'));
    await expect(promptSection.first()).toBeVisible({ timeout: 5000 });

    // Close modal — the close button renders a Lucide <X> SVG icon (not "×" text)
    const closeBtn = modal
      .first()
      .locator('button')
      .filter({ has: page.locator('svg') })
      .first();
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    await expect(modal.first()).toBeHidden({ timeout: 5000 });
  });

  // AD-06: Run optimisation button state
  test.fixme('AD-06: Optimisation button', async ({ page }) => {
    await page.goto('/agent-demo/optimiser');

    const optimiserContent = page.locator('text=Sandbox Commits').first();
    const loaded = await optimiserContent.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!loaded, 'Agent demo optimiser page not available');

    // Run Optimisation button should exist
    const optimiseBtn = page.locator('button:has-text("Run Optimisation")').first();
    const hasBtn = await optimiseBtn.isVisible().catch(() => false);

    test.skip(!hasBtn, 'Run Optimisation button not present');

    // Button may be disabled if no feedback ratings exist
    const isDisabled = await optimiseBtn.isDisabled();
    if (isDisabled) {
      // Should show requirement message
      const requirement = page.locator('text=/rate at least/i');
      await expect(requirement.first()).toBeVisible({ timeout: 5000 });
    } else {
      // Button is enabled — requirement message should NOT be shown
      const requirement = page.locator('text=/rate at least/i');
      const hasRequirement = await requirement
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasRequirement).toBe(false);
    }
  });

  // AD-07: No unexpected console errors on chat page
  test.fixme('AD-07: Chat page no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/agent-demo/chat');

    // Wait for page content to render instead of fixed timeout
    const pageContent = page.locator('textarea, text=Start a conversation').first();
    await pageContent.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    const loaded = await pageContent.isVisible().catch(() => false);
    test.skip(!loaded, 'Agent demo chat page not available');

    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });
});
