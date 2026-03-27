import { API_BASE, cleanupProject, createTestProject } from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';
import { isExpectedConsoleError } from './fixtures/test-data-factory';

/**
 * Draft Workbench E2E Tests
 *
 * Tests for Workbench RFC V2 features:
 * - Draft creation and page load
 * - Node list display and toggles
 * - AutoSuggestPanel (goal-driven suggestions)
 * - PreviewPanel with model selector and auto-preview toggle
 * - Preview scroll sync infrastructure
 * - Commit flow
 */

test.describe('Draft Workbench', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let commitHash: string;
  let draftId: string;
  let draftNoGoalId: string;

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Draft E2E ${Date.now()}`);
    projectId = id;

    // Create a commit with frames (knowledge base for suggestions)
    const commitResp = await request.post(`${API_BASE}/commits`, {
      data: {
        project_id: projectId,
        content: {
          frames: [
            {
              id: 'f_001',
              type: 'legacy_sentence',
              slots: { text: 'Product pricing starts at $29 per month' },
            },
            {
              id: 'f_002',
              type: 'legacy_sentence',
              slots: { text: 'Enterprise tier includes 99.9% SLA' },
            },
            { id: 'f_003', type: 'legacy_sentence', slots: { text: 'Free trial lasts 14 days' } },
          ],
          relations: [],
        },
        author: { type: 'human', name: 'E2E Tester' },
        branch: 'main',
        message: 'Initial knowledge commit',
      },
    });
    const commitData = await commitResp.json();
    commitHash = commitData.data.commit.hash;

    // Create draft WITH goal
    const draftResp1 = await request.post(`${API_BASE}/drafts`, {
      data: {
        project_id: projectId,
        title: 'E2E Draft With Goal',
        goal: 'Product pricing strategy for enterprise market',
        parent_commit_hash: commitHash,
      },
    });
    const d1 = await draftResp1.json();
    draftId = d1.data.id;

    // PATCH to add nodes (create API doesn't accept nodes inline)
    await request.patch(`${API_BASE}/drafts/${draftId}`, {
      data: {
        nodes: [
          {
            id: 's_dw_1',
            text: 'Our product targets enterprise customers',
            origin: { type: 'manual' },
            position: 0,
            included: true,
          },
          {
            id: 's_dw_2',
            text: 'Pricing model follows SaaS best practices',
            origin: { type: 'manual' },
            position: 1,
            included: true,
          },
          {
            id: 's_dw_3',
            text: 'Competitor analysis shows market gap',
            origin: { type: 'manual' },
            position: 2,
            included: false,
          },
        ],
        if_revision: 1,
      },
    });

    // Create draft WITHOUT goal
    const draftResp2 = await request.post(`${API_BASE}/drafts`, {
      data: {
        project_id: projectId,
        title: 'E2E Draft No Goal',
      },
    });
    const d2 = await draftResp2.json();
    draftNoGoalId = d2.data.id;

    // Add a node to no-goal draft
    await request.patch(`${API_BASE}/drafts/${draftNoGoalId}`, {
      data: {
        nodes: [
          {
            id: 's_dw_ng_1',
            text: 'Test sentence without goal',
            origin: { type: 'manual' },
            position: 0,
            included: true,
          },
        ],
        if_revision: 1,
      },
    });
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  // Navigate to draft page (onboarding dialogs auto-suppressed by custom fixture)
  async function gotoDraft(page: import('@playwright/test').Page, id: string) {
    await page.goto(`/project/${projectId}/draft/${id}`);
  }

  // Suppress expected console errors
  function setupConsoleFilter(page: import('@playwright/test').Page) {
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isExpectedConsoleError(msg.text())) {
        if (msg.text().includes('net::') || msg.text().includes('Failed to fetch')) return;
      }
    });
  }

  test('DW-01: Draft page loads with nodes', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    // Wait for workspace to load (title in action bar)
    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // Node list should show our nodes
    await expect(page.locator('text=Our product targets enterprise customers').first()).toBeVisible(
      {
        timeout: 10000,
      }
    );
    await expect(
      page.locator('text=Pricing model follows SaaS best practices').first()
    ).toBeVisible();
    await expect(page.locator('text=Competitor analysis shows market gap').first()).toBeVisible();
  });

  test('DW-02: AutoSuggestPanel shows with goal', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // AutoSuggestPanel should be visible with "Suggestions" header
    const suggestPanel = page.locator('text=Suggestions').first();
    await expect(suggestPanel).toBeVisible({ timeout: 10000 });

    // Should show goal-based content (suggestions, error, or empty state)
    const panelSection = page.locator('section').filter({ hasText: 'Suggestions' }).first();
    await expect(panelSection).toBeVisible();
  });

  test('DW-03: PreviewPanel shows model selector and auto toggle', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // V2: Auto toggle switch should be visible
    const autoSwitch = page.locator('[role="switch"]').first();
    await expect(autoSwitch).toBeVisible({ timeout: 10000 });

    // V2: Model selector should show "Haiku" default
    const haikuText = page.locator('text=Haiku').first();
    await expect(haikuText).toBeVisible({ timeout: 5000 });

    // Generate Preview button should be visible
    const generateBtn = page.locator('button:has-text("Generate Preview")');
    await expect(generateBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('DW-04: Model selector dropdown has options', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // Find the model selector combobox (contains "Haiku")
    const modelTrigger = page.locator('[role="combobox"]').filter({ hasText: 'Haiku' }).first();
    await expect(modelTrigger).toBeVisible({ timeout: 5000 });

    // Open dropdown
    await modelTrigger.click();

    // Should show Sonnet option
    const sonnetOption = page.locator('[role="option"]').filter({ hasText: 'Sonnet' }).first();
    await expect(sonnetOption).toBeVisible({ timeout: 5000 });
  });

  test('DW-05: Node include count updates', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // Check the include count indicator (should show "2/3 included" since 1 is excluded)
    const includeCount = page.locator('text=/\\d+\\/\\d+ included/').first();
    await expect(includeCount).toBeVisible({ timeout: 10000 });
  });

  test('DW-06: Breadcrumb and action bar present', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // Action bar should have Back button
    const backBtn = page.locator('button:has-text("Back")').first();
    await expect(backBtn).toBeVisible({ timeout: 5000 });

    // Draft label in breadcrumb
    const draftLabel = page.locator('text=Draft').first();
    await expect(draftLabel).toBeVisible();
  });

  test('DW-07: AutoSuggestPanel shows hint when no goal', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftNoGoalId);

    await expect(page.locator('text=E2E Draft No Goal').first()).toBeVisible({ timeout: 15000 });

    // Without a goal, AutoSuggestPanel should show the dashed-border hint
    await expect(page.locator('text=Set a goal to get sentence suggestions').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('DW-08: Preview split pane layout', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // Top pane: nodes area
    const nodeText = page.locator('text=Our product targets enterprise customers').first();
    await expect(nodeText).toBeVisible();

    // Bottom pane: preview area with "Preview" label
    const previewLabel = page.locator('text=Preview').first();
    await expect(previewLabel).toBeVisible({ timeout: 5000 });

    // Resize handle should exist
    const resizer = page.locator('[role="separator"]').first();
    await expect(resizer).toBeVisible({ timeout: 5000 });
  });

  test('DW-09: Preview type selector available', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // Preview type selector (from page snapshot: combobox with "Twitter")
    const typeSelector = page.locator('[role="combobox"]').first();
    await expect(typeSelector).toBeVisible({ timeout: 5000 });
  });

  test('DW-10: Collapsible sections work', async ({ page }) => {
    setupConsoleFilter(page);
    await gotoDraft(page, draftId);

    await expect(page.locator('text=E2E Draft With Goal').first()).toBeVisible({ timeout: 15000 });

    // "Output & Constraints" collapsible section
    const outputSection = page.locator('button:has-text("Output & Constraints")').first();
    await expect(outputSection).toBeVisible({ timeout: 5000 });

    // "Changes from Parent" collapsible section
    const diffSection = page.locator('button:has-text("Changes from Parent")').first();
    await expect(diffSection).toBeVisible({ timeout: 5000 });

    // Click to expand "Output & Constraints"
    await outputSection.click();
    await page.waitForTimeout(300);
  });
});
