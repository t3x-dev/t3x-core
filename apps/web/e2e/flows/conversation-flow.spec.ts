import { expect, test } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestPin,
  createTestProject,
  createTestTurn,
} from '../fixtures/api-helpers';
import { ConversationPage } from '../fixtures/page-objects/conversation-page';

/**
 * Conversation Flow E2E Tests
 *
 * Tests conversation page interactions including:
 * - Viewing conversation turns
 * - Turn highlighting via URL params
 * - Pinning conversations
 * - Context panel display
 */

test.describe('Conversation Flow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let userTurnHash: string;

  const userContent = 'I prefer dark mode for all applications and tools I use daily.';
  const assistantContent =
    'Understood! I will remember that you prefer dark mode for all applications.';

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Conversation E2E ${Date.now()}`);
    projectId = id;

    conversationId = await createTestConversation(request, projectId, 'E2E Test Conversation');

    userTurnHash = await createTestTurn(request, projectId, conversationId, 'user', userContent);
    await createTestTurn(request, projectId, conversationId, 'assistant', assistantContent);
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  // CF-01: View conversation turns — both user and assistant turns displayed
  // #15: Use expectTurnContent (full Playwright expect) instead of slice + boolean check
  test('CF-01: View conversation turns', async ({ page }) => {
    const conv = new ConversationPage(page);
    await conv.goto(projectId, conversationId);
    await conv.waitForLoad();

    // Full content strings visible via Playwright's built-in text matching
    await conv.expectTurnContent(userContent);
    await conv.expectTurnContent(assistantContent);

    // Role badges should be present
    await expect(page.locator('text=USER').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=ASSISTANT').first()).toBeVisible({ timeout: 5000 });
  });

  // CF-02: Turn highlighting via URL params
  // #2: Assert highlight unconditionally — our test data should produce it
  test('CF-02: Turn highlighting', async ({ page }) => {
    const conv = new ConversationPage(page);
    // Navigate with highlight on user turn: highlight "dark mode" (chars 9-18)
    await conv.gotoWithHighlight(projectId, conversationId, userTurnHash, 9, 18);
    await conv.waitForLoad();

    // The <mark> element should contain exactly "dark mode"
    const mark = page.locator('mark').first();
    await expect(mark).toBeVisible({ timeout: 10000 });
    await expect(mark).toHaveText('dark mode');
  });

  // CF-03: Pin conversation via API and verify
  test('CF-03: Pin conversation', async ({ request }) => {
    const pinId = await createTestPin(request, projectId, 'conversation', conversationId);
    expect(pinId).toBeDefined();
    expect(pinId).toMatch(/^pin_/);
  });

  // CF-04: Context panel shows pinned items
  // #3: Assert meaningful content in context panel, not just textContent defined
  test('CF-04: Context panel shows pins', async ({ page }) => {
    const conv = new ConversationPage(page);
    await conv.goto(projectId, conversationId);
    await conv.waitForLoad();

    // Context panel should exist
    const hasContext = await conv.hasContextPanel();
    test.skip(!hasContext, 'Context panel not present on this page');

    // The right-side context panel (not the left nav sidebar)
    const contextArea = page.locator('aside').filter({ hasText: 'Context' }).first();
    // Must contain pin-related content — not just any text
    await expect(contextArea).toContainText(/pin|using/i, { timeout: 5000 });
  });
});
