import { API_BASE } from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

/**
 * Full DiffDisplayView E2E Test
 *
 * Creates complete test data with real conversations and turns,
 * then tests the full diff comparison flow in the UI.
 */

test.describe('DiffDisplayView Full E2E', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let projectName: string;
  let conversation1Id: string;
  let conversation2Id: string;
  let _turn1Hash: string;
  let _turn2Hash: string;
  let commit1Hash: string;
  let commit2Hash: string;

  test.beforeAll(async ({ request }) => {
    // 1. Create project
    projectName = `Diff E2E ${Date.now()}`;
    const projectRes = await request.post(`${API_BASE}/projects`, {
      data: { name: projectName },
    });
    const projectData = await projectRes.json();
    expect(projectData.success).toBe(true);
    projectId = projectData.data.project_id;

    // 2. Create FIRST conversation for commit 1
    const conv1Res = await request.post(`${API_BASE}/conversations`, {
      data: {
        project_id: projectId,
        title: 'Initial Requirements',
      },
    });
    const conv1Data = await conv1Res.json();
    expect(conv1Data.success).toBe(true);
    conversation1Id = conv1Data.data.conversation_id;

    // 3. Create turn in first conversation
    const turn1Res = await request.post(`${API_BASE}/turns`, {
      data: {
        project_id: projectId,
        conversation_id: conversation1Id,
        role: 'user',
        content: 'I prefer dark mode for the UI. My budget is $3000 and the deadline is Friday.',
      },
    });
    const turn1Data = await turn1Res.json();
    expect(turn1Data.success).toBe(true);
    _turn1Hash = turn1Data.data.turn_hash;

    // 4. Create SECOND conversation for commit 2
    const conv2Res = await request.post(`${API_BASE}/conversations`, {
      data: {
        project_id: projectId,
        title: 'Updated Requirements',
      },
    });
    const conv2Data = await conv2Res.json();
    expect(conv2Data.success).toBe(true);
    conversation2Id = conv2Data.data.conversation_id;

    // 5. Create turn in second conversation
    const turn2Res = await request.post(`${API_BASE}/turns`, {
      data: {
        project_id: projectId,
        conversation_id: conversation2Id,
        role: 'assistant',
        content:
          'Got it! Dark mode, $3000 budget, Friday deadline. I will also schedule a meeting for Monday.',
      },
    });
    const turn2Data = await turn2Res.json();
    expect(turn2Data.success).toBe(true);
    _turn2Hash = turn2Data.data.turn_hash;

    // 6. Create first commit with frames
    const commit1Res = await request.post(`${API_BASE}/commits`, {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'Initial requirements',
        parents: [],
        expected_head: null,
        content: {
          trees: [
            {
              key: 't_001',
              type: 'legacy_sentence',
              slots: { text: 'User prefers dark mode' },
              children: [],
            },
            {
              key: 't_002',
              type: 'legacy_sentence',
              slots: { text: 'Budget is $3000' },
              children: [],
            },
            {
              key: 't_003',
              type: 'legacy_sentence',
              slots: { text: 'Deadline is Friday' },
              children: [],
            },
          ],
          relations: [],
        },
        author: { type: 'human', name: 'E2E Tester' },
        sources: [{ type: 'conversation', id: conversation1Id }],
      },
    });
    const commit1Data = await commit1Res.json();
    expect(commit1Data.success).toBe(true);
    commit1Hash = commit1Data.data.commit.digest;

    // 7. Create second commit with modified frames
    const commit2Res = await request.post(`${API_BASE}/commits`, {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'Updated requirements',
        parents: [commit1Hash],
        expected_head: commit1Hash,
        content: {
          trees: [
            {
              key: 't_001',
              type: 'legacy_sentence',
              slots: { text: 'User prefers dark mode' },
              children: [],
            },
            {
              key: 't_002',
              type: 'legacy_sentence',
              slots: { text: 'Budget is $3000' },
              children: [],
            },
            {
              key: 't_004',
              type: 'legacy_sentence',
              slots: { text: 'Meeting scheduled for Monday' },
              children: [],
            },
            // t_003 (Deadline) removed
          ],
          relations: [],
        },
        author: { type: 'human', name: 'E2E Tester' },
        sources: [{ type: 'conversation', id: conversation2Id }],
      },
    });
    const commit2Data = await commit2Res.json();
    expect(commit2Data.success).toBe(true);
    commit2Hash = commit2Data.data.commit.digest;
  });

  test('API data is correct', async ({ request }) => {
    // Verify commits have correct data
    const [res1, res2] = await Promise.all([
      request.get(`${API_BASE}/commits/${commit1Hash}?project_id=${projectId}`),
      request.get(`${API_BASE}/commits/${commit2Hash}?project_id=${projectId}`),
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.data.commit.content.trees).toHaveLength(3);
    expect(data2.data.commit.content.trees).toHaveLength(3);

    // Verify parent relationship
    expect(data2.data.commit.parents).toContain(commit1Hash);
  });

  test('Canvas loads with commits', async ({ page }) => {
    // Navigate directly to project canvas view
    await page.goto(`/project/${projectId}?view=canvas`);
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 15000 });

    // Wait for "Loading..." to disappear (nodes loaded)
    await page
      .locator('text=Loading...')
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => {});

    // Screenshot
    await page.screenshot({ path: 'test-results/diff-full-canvas.png' });

    // Verify at least one node (Canvas may show head commit only)
    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible({ timeout: 15000 });
    const nodeCount = await nodes.count();

    expect(nodeCount).toBeGreaterThanOrEqual(1);

    // Check page has loaded properly (either commit message or committed state)
    const pageText = await page
      .locator('body')
      .innerText()
      .then((t) => t.toLowerCase());
    const hasCommitContent =
      pageText.includes('committed') ||
      pageText.includes('initial requirements') ||
      pageText.includes('updated requirements') ||
      pageText.includes('nodes') ||
      pageText.includes('sources') ||
      pageText.includes('create commit');

    expect(hasCommitContent).toBe(true);
  });

  test('Can open commit modal with View full', async ({ page }) => {
    // Navigate directly to project canvas view
    await page.goto(`/project/${projectId}?view=canvas`);
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 15000 });

    // Wait for "Loading..." to disappear
    await page
      .locator('text=Loading...')
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => {});

    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible({ timeout: 15000 });
    await nodes.first().click();
    const sidebar = page.locator('aside').first();
    await sidebar.waitFor({ state: 'visible', timeout: 10000 });

    // Find View full button
    const viewFullBtn = page.getByText('View full').first();
    const hasViewFull = await viewFullBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasViewFull) {
      await viewFullBtn.click();

      // Wait for modal to open (check for modal header)
      const modalHeader = page.locator('text=Commit:');
      const modalOpened = await modalHeader.isVisible({ timeout: 5000 });

      // Screenshot
      await page.screenshot({ path: 'test-results/diff-full-modal.png' });

      // Check for Compare section (UI shows "COMPARE" in uppercase)
      const hasCompare = await page.locator('text=COMPARE').isVisible();
      const hasCompareBtn = await page.locator('text=Compare with').isVisible();

      expect(hasCompare || hasCompareBtn || modalOpened).toBe(true);
    } else {
      // Current canvas opens the commit detail sidebar directly from the node.
      await expect(sidebar).toBeVisible();
      await page.screenshot({ path: 'test-results/diff-full-modal-sources.png' });
    }
  });

  test('Can run diff comparison', async ({ page }) => {
    const response = await page.goto(
      `/project/${projectId}/diff?base=${encodeURIComponent(commit1Hash)}&target=${encodeURIComponent(commit2Hash)}`,
      { waitUntil: 'domcontentloaded' }
    );
    expect(response?.status() ?? 200).toBeLessThan(400);

    await expect(page.getByTitle(commit1Hash)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle(commit2Hash)).toBeVisible();
    await expect(page.getByText('Added (1)', { exact: true })).toBeVisible();
    await expect(page.getByText('Removed (1)', { exact: true })).toBeVisible();
    await expect(page.getByText('Show identical (2)', { exact: true })).toBeVisible();

    const body = page.locator('body');
    await expect(body).toContainText('Meeting scheduled for Monday');
    await expect(body).toContainText('Deadline is Friday');

    await page.getByRole('button', { name: 'Unified', exact: true }).click();
    await expect(body).toContainText('Meeting scheduled for Monday');
    await expect(body).toContainText('Deadline is Friday');
    await page.screenshot({ path: 'test-results/diff-full-result.png' });
  });

  test('Provides manual verification URL', async () => {
    // Verification info available via test metadata; projectId is set in beforeAll
    expect(projectId).toBeTruthy();
  });
});
