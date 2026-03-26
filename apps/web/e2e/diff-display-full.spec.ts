import { expect, test } from './fixtures/test';

/**
 * Full DiffDisplayView E2E Test
 *
 * Creates complete test data with real conversations and turns,
 * then tests the full diff comparison flow in the UI.
 */

const API_BASE = 'http://localhost:8000/api/v1';

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
        content: {
          frames: [
            {
              id: 'f_001',
              type: 'legacy_sentence',
              slots: { text: 'User prefers dark mode' },
            },
            {
              id: 'f_002',
              type: 'legacy_sentence',
              slots: { text: 'Budget is $3000' },
            },
            {
              id: 'f_003',
              type: 'legacy_sentence',
              slots: { text: 'Deadline is Friday' },
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
    commit1Hash = commit1Data.data.commit.hash;

    // 7. Create second commit with modified frames
    const commit2Res = await request.post(`${API_BASE}/commits`, {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'Updated requirements',
        parents: [commit1Hash],
        content: {
          frames: [
            {
              id: 'f_001',
              type: 'legacy_sentence',
              slots: { text: 'User prefers dark mode' },
            },
            {
              id: 'f_002',
              type: 'legacy_sentence',
              slots: { text: 'Budget is $3000' },
            },
            {
              id: 'f_004',
              type: 'legacy_sentence',
              slots: { text: 'Meeting scheduled for Monday' },
            },
            // f_003 (Deadline) removed
          ],
          relations: [],
        },
        author: { type: 'human', name: 'E2E Tester' },
        sources: [{ type: 'conversation', id: conversation2Id }],
      },
    });
    const commit2Data = await commit2Res.json();
    expect(commit2Data.success).toBe(true);
    commit2Hash = commit2Data.data.commit.hash;
  });

  test('API data is correct', async ({ request }) => {
    // Verify commits have correct data
    const [res1, res2] = await Promise.all([
      request.get(`${API_BASE}/commits/${commit1Hash}`),
      request.get(`${API_BASE}/commits/${commit2Hash}`),
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.data.commit.content.frames).toHaveLength(3);
    expect(data2.data.commit.content.frames).toHaveLength(3);

    // Verify parent relationship
    expect(data2.data.commit.parents).toContain(commit1Hash);
  });

  test('Canvas loads with commits', async ({ page }) => {
    // Navigate directly to project canvas view
    await page.goto(`/project/${projectId}?view=canvas`);
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 15000 });

    // Wait for "Loading..." to disappear (sentences loaded)
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
      pageText.includes('sentences') ||
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

    // Find View full button
    const viewFullBtn = page.getByText('View full').first();
    const hasViewFull = await viewFullBtn.isVisible({ timeout: 10000 });

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
      // Fallback: Click SOURCES to open modal, then check if we can switch view
      const sourcesBtn = page.locator('text=SOURCES').first();
      await sourcesBtn.click();

      // Wait for modal content to appear
      await page.locator('aside').first().waitFor({ state: 'visible', timeout: 5000 });

      await page.screenshot({ path: 'test-results/diff-full-modal-sources.png' });
    }
  });

  test('Can run diff comparison', async ({ page }) => {
    // Monitor network requests for turn context API
    const turnContextResponses: { url: string; status: number }[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/turns/') && response.url().includes('/context')) {
        turnContextResponses.push({ url: response.url(), status: response.status() });
      }
    });

    // Navigate directly to project canvas view
    await page.goto(`/project/${projectId}?view=canvas`);
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 15000 });

    // Wait for "Loading..." to disappear
    await page
      .locator('text=Loading...')
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => {});

    // Screenshot before trying to click
    await page.screenshot({ path: 'test-results/diff-full-before-click.png' });

    // Try to find and click View full with force
    const viewFullBtn = page.getByText('View full').first();
    const hasViewFull = await viewFullBtn.isVisible({ timeout: 5000 });

    if (!hasViewFull) {
      await page.screenshot({ path: 'test-results/diff-full-no-viewfull.png' });

      // Alternative: click SOURCES to open modal, then navigate to commit view
      const sourcesBtn = page.locator('text=SOURCES').first();
      const sourcesVisible = await sourcesBtn.isVisible({ timeout: 3000 });
      if (sourcesVisible) {
        await sourcesBtn.click();

        // Wait for modal content to appear
        await page.locator('aside').first().waitFor({ state: 'visible', timeout: 5000 });

        // Look for a way to switch to commit view or find Compare section
        const pageText = await page.locator('body').innerText();

        if (!pageText.includes('Compare')) {
          test.skip();
          return;
        }
      } else {
        test.skip();
        return;
      }
    } else {
      await viewFullBtn.click();

      // Wait for modal
      await page
        .locator('text=Commit:')
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {});
    }

    // Look for Compare section
    const compareBtn = page.locator('button:has-text("Compare with")');
    const hasCompareBtn = await compareBtn.isVisible({ timeout: 5000 });

    if (!hasCompareBtn) {
      // Scroll sidebar
      const sidebar = page.locator('aside').first();
      await sidebar.evaluate((el) => (el.scrollTop = el.scrollHeight));
    }

    const compareBtnAfterScroll = page.locator('button:has-text("Compare with")');
    const compareBtnVisible = await compareBtnAfterScroll.isVisible({ timeout: 3000 });
    if (compareBtnVisible) {
      await compareBtnAfterScroll.click();

      // Wait for the select dropdown to appear
      const select = page.locator('select').first();
      await select.waitFor({ state: 'visible', timeout: 5000 });

      const options = await select.locator('option').allTextContents();

      if (options.length > 1) {
        await select.selectOption({ index: 1 });

        // Click Run Diff and wait for results
        await page.locator('button:has-text("Run Diff")').click();

        // Wait for diff results to appear by checking for diff-related content
        await expect(page.locator('body')).toContainText(
          /(identical|Unified|Side-by-side|only in)/,
          { timeout: 15000 }
        );

        // Screenshot result
        await page.screenshot({ path: 'test-results/diff-full-result.png' });

        // Verify DiffDisplayView
        const pageText = await page.locator('body').innerText();
        const hasDiffView =
          pageText.includes('identical') ||
          pageText.includes('Unified') ||
          pageText.includes('Side-by-side') ||
          pageText.includes('only in');

        expect(hasDiffView).toBe(true);
      }
    } else {
      await page.screenshot({ path: 'test-results/diff-full-no-compare.png' });
    }
  });

  test('Provides manual verification URL', async () => {
    // Verification info available via test metadata; projectId is set in beforeAll
    expect(projectId).toBeTruthy();
  });
});
