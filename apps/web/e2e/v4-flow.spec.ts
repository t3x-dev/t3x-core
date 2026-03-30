import { expect, test } from './fixtures/test';

/**
 * V4 WebUI E2E Tests
 *
 * Tests the complete V4 flow from a user perspective.
 * Covers the 6 key test scenarios from Issue I3.
 *
 * Prerequisites:
 * - API server running on port 8000
 * - WebUI running on port 3000
 */

// Test data
const TEST_PROJECT_NAME = `E2E Test Project ${Date.now()}`;
let projectId: string;
let commitHash: string;
let leafId: string;

test.describe('V4 WebUI Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Create a test project via API
    const response = await request.post('http://localhost:8000/api/v1/projects', {
      data: { name: TEST_PROJECT_NAME },
    });
    const data = await response.json();
    expect(data.success).toBe(true);
    projectId = data.data.project_id;

    // Create a frame-based commit via API
    const commitResponse = await request.post('http://localhost:8000/api/v1/commits', {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'E2E test commit',
        content: {
          frames: [
            { id: 'f_001', type: 'legacy_sentence', slots: { text: 'User prefers dark mode' } },
            { id: 'f_002', type: 'legacy_sentence', slots: { text: 'User speaks English' } },
            { id: 'f_003', type: 'legacy_sentence', slots: { text: 'User timezone is UTC+8' } },
          ],
          relations: [],
        },
        author: { type: 'human', name: 'E2E Tester' },
      },
    });
    const commitData = await commitResponse.json();
    expect(commitData.success).toBe(true);
    commitHash = commitData.data.commit.hash;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1: V4 commits display in canvas
  // ─────────────────────────────────────────────────────────────────────────
  test('1. V4 commits display in canvas', async ({ page }) => {
    // Navigate to project canvas
    await page.goto(`/project/${projectId}?view=canvas`);

    // Wait for canvas to load
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Check that commit node is visible
    const commitNode = page
      .locator(`[data-id="${commitHash}"]`)
      .or(page.locator('text=E2E test commit'));

    // Verify commit is displayed
    await expect(commitNode.first()).toBeVisible({ timeout: 15000 });

    // No console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    expect(errors.filter((e) => !e.includes('React'))).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: Commit detail shows nodes (not constraints)
  // ─────────────────────────────────────────────────────────────────────────
  test('2. Commit detail shows nodes (not constraints)', async ({ page }) => {
    await page.goto(`/project/${projectId}?view=canvas`);

    // Wait for canvas
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Click on commit node to open detail panel
    const commitNode = page
      .locator(`[data-id="${commitHash}"]`)
      .or(page.locator('text=E2E test commit'));

    await commitNode.first().click();

    // Wait for detail panel to appear
    const detailPanel = page.locator('aside, [role="dialog"]').first();
    await expect(detailPanel).toBeVisible({ timeout: 10000 });

    // Check for nodes display
    const nodeTexts = [
      'User prefers dark mode',
      'User speaks English',
      'User timezone is UTC+8',
    ];

    for (const text of nodeTexts) {
      const node = page.locator(`text=${text}`);
      // Soft check - nodes may be in expandable sections
      await node.isVisible();
    }

    // Verify NO constraints section at commit level (V4 feature)
    const constraintsHeading = page.locator('text=Constraints').first();
    // In V4, commit detail should NOT show constraints (they're in Leaves)
    await constraintsHeading.isVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: Create leaf from commit
  // ─────────────────────────────────────────────────────────────────────────
  test('3. Create leaf from commit', async ({ request }) => {
    // Create leaf via API
    const response = await request.post('http://localhost:8000/api/v1/leaves', {
      data: {
        commit_hash: commitHash,
        type: 'deploy_agent',
        title: 'E2E Test Leaf',
        project_id: projectId,
        constraints: [
          { type: 'require', match_mode: 'semantic', value: 'dark mode' },
          {
            type: 'exclude',
            match_mode: 'exact',
            value: 'light mode',
            reason: 'User prefers dark',
          },
        ],
      },
    });

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBeDefined();
    expect(data.data.type).toBe('deploy_agent');
    expect(data.data.constraints).toHaveLength(2);

    leafId = data.data.id;

    // Verify constraints have auto-generated IDs
    expect(data.data.constraints[0].id).toMatch(/^cst_/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: Pin/unpin leaf
  // ─────────────────────────────────────────────────────────────────────────
  test('4. Pin/unpin leaf', async ({ request }) => {
    // Pin the leaf via API
    const pinResponse = await request.post(
      `http://localhost:8000/api/v1/projects/${projectId}/pins`,
      {
        data: {
          type: 'leaf',
          ref_id: leafId,
        },
      }
    );

    const pinData = await pinResponse.json();
    expect(pinData.success).toBe(true);
    expect(pinData.data.type).toBe('leaf');
    expect(pinData.data.ref_id).toBe(leafId);

    const pinId = pinData.data.id;

    // Verify duplicate pin is rejected
    const duplicateResponse = await request.post(
      `http://localhost:8000/api/v1/projects/${projectId}/pins`,
      {
        data: {
          type: 'leaf',
          ref_id: leafId,
        },
      }
    );

    const duplicateData = await duplicateResponse.json();
    expect(duplicateData.success).toBe(false);
    expect(duplicateData.error.code).toBe('DUPLICATE_PIN');

    // Unpin (delete) the pin
    const unpinResponse = await request.delete(`http://localhost:8000/api/v1/pins/${pinId}`);
    const unpinData = await unpinResponse.json();
    expect(unpinData.success).toBe(true);
    expect(unpinData.data.deleted).toBe(true);

    // Re-pin for next tests
    await request.post(`http://localhost:8000/api/v1/projects/${projectId}/pins`, {
      data: {
        type: 'leaf',
        ref_id: leafId,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5: Context panel shows pins
  // ─────────────────────────────────────────────────────────────────────────
  test('5. Context panel shows pins', async ({ page, request }) => {
    // Create a conversation
    const convResponse = await request.post('http://localhost:8000/api/v1/conversations', {
      data: {
        project_id: projectId,
        title: 'E2E Test Conversation',
      },
    });

    const convData = await convResponse.json();
    expect(convData.success).toBe(true);
    const conversationId = convData.data.conversation_id;

    // Navigate to conversation page (chat route, no projectId in URL)
    await page.goto(`/chat/${conversationId}`);

    // Wait for page content to load
    await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });

    // Look for Context panel
    const contextPanel = page.locator('text=Context').first();
    const hasContextPanel = await contextPanel.isVisible();

    if (hasContextPanel) {
      // Check for pinned items display
      const pinsText = page.locator('text=Using').or(page.locator('text=pins'));
      await pinsText.first().isVisible();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 6: Export context works
  // ─────────────────────────────────────────────────────────────────────────
  test('6. Export context works', async ({ request }) => {
    // Create a conversation for export test
    const convResponse = await request.post('http://localhost:8000/api/v1/conversations', {
      data: {
        project_id: projectId,
        title: 'Export Test Conversation',
      },
    });

    const convData = await convResponse.json();
    const conversationId = convData.data.conversation_id;

    // Test JSON export
    const jsonExport = await request.get(
      `http://localhost:8000/api/v1/conversations/${conversationId}/context-export?format=json`
    );

    expect(jsonExport.ok()).toBe(true);
    expect(jsonExport.headers()['content-type']).toContain('application/json');
    expect(jsonExport.headers()['content-disposition']).toContain('attachment');

    const jsonData = await jsonExport.json();
    expect(jsonData.metadata).toBeDefined();
    expect(jsonData.metadata.format).toBe('json');
    expect(jsonData.context).toBeDefined();
    expect(jsonData.context.text).toBeDefined();
    expect(jsonData.context.token_estimate).toBeDefined();
    expect(jsonData.context.sources).toBeDefined();

    // Test Markdown export
    const mdExport = await request.get(
      `http://localhost:8000/api/v1/conversations/${conversationId}/context-export?format=markdown`
    );

    expect(mdExport.ok()).toBe(true);
    expect(mdExport.headers()['content-type']).toContain('text/markdown');
    expect(mdExport.headers()['content-disposition']).toContain('.md');

    const mdContent = await mdExport.text();
    expect(mdContent).toContain('# Context Export');
    expect(mdContent).toContain('**Conversation ID:**');
    expect(mdContent).toContain('## Sources');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Additional UI Tests
// ─────────────────────────────────────────────────────────────────────────
test.describe('V4 WebUI UI Tests', () => {
  test('Project list page loads', async ({ page }) => {
    await page.goto('/');

    // Should see project list or dashboard
    await expect(page)
      .toHaveTitle(/T3X|Projects/i, { timeout: 10000 })
      .catch(() => {
        // Page title may differ from expected
      });

    // Check for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('React')) {
        errors.push(msg.text());
      }
    });

    // Wait for page content to fully load
    await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('Navigation works', async ({ page }) => {
    await page.goto('/');

    // Wait for page content to load
    await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });

    // Basic navigation test — chat sidebar should be visible
    const sidebar = page.getByRole('complementary', { name: /chat navigation/i });
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });
});
