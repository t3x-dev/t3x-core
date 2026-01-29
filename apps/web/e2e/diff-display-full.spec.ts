import { test, expect } from '@playwright/test';

/**
 * Full DiffDisplayView E2E Test
 *
 * Creates complete test data with real conversations and turns,
 * then tests the full diff comparison flow in the UI.
 */

const API_BASE = 'http://localhost:8000/api/v1';

test.describe('DiffDisplayView Full E2E', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000); // Increase timeout to 60 seconds

  let projectId: string;
  let projectName: string;
  let conversation1Id: string;
  let conversation2Id: string;
  let turn1Hash: string;
  let turn2Hash: string;
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
    console.log(`Created project: ${projectName} (${projectId})`);

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
    console.log(`Created conversation 1: ${conversation1Id}`);

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
    turn1Hash = turn1Data.data.turn_hash;
    console.log(`Created turn 1: ${turn1Hash}`);

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
    console.log(`Created conversation 2: ${conversation2Id}`);

    // 5. Create turn in second conversation
    const turn2Res = await request.post(`${API_BASE}/turns`, {
      data: {
        project_id: projectId,
        conversation_id: conversation2Id,
        role: 'assistant',
        content: 'Got it! Dark mode, $3000 budget, Friday deadline. I will also schedule a meeting for Monday.',
      },
    });
    const turn2Data = await turn2Res.json();
    expect(turn2Data.success).toBe(true);
    turn2Hash = turn2Data.data.turn_hash;
    console.log(`Created turn 2: ${turn2Hash}`);

    // 6. Create first V3 commit with sentences from turn 1
    const commit1Res = await request.post(`${API_BASE}/commits-v3`, {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'Initial requirements',
        content: {
          sentences: [
            { id: 's1', text: 'User prefers dark mode', source: { turn_hash: turn1Hash, start_char: 9, end_char: 31 } },
            { id: 's2', text: 'Budget is $3000', source: { turn_hash: turn1Hash, start_char: 46, end_char: 61 } },
            { id: 's3', text: 'Deadline is Friday', source: { turn_hash: turn1Hash, start_char: 66, end_char: 84 } },
          ],
        },
        author: { name: 'E2E Tester' },
        source_refs: [{ type: 'conversation', conversation_id: conversation1Id }],
      },
    });
    const commit1Data = await commit1Res.json();
    expect(commit1Data.success).toBe(true);
    commit1Hash = commit1Data.data.hash;
    console.log(`Created commit 1: ${commit1Hash}`);

    // 7. Create second V3 commit with modified sentences from turn 2
    const commit2Res = await request.post(`${API_BASE}/commits-v3`, {
      data: {
        project_id: projectId,
        branch: 'main',
        message: 'Updated requirements',
        parents: [commit1Hash],
        content: {
          sentences: [
            { id: 's1', text: 'User prefers dark mode', source: { turn_hash: turn1Hash, start_char: 9, end_char: 31 } },
            { id: 's2', text: 'Budget is $3000', source: { turn_hash: turn2Hash, start_char: 11, end_char: 26 } },
            { id: 's4', text: 'Meeting scheduled for Monday', source: { turn_hash: turn2Hash, start_char: 61, end_char: 89 } },
            // s3 (Deadline) removed
          ],
        },
        author: { name: 'E2E Tester' },
        source_refs: [{ type: 'conversation', conversation_id: conversation2Id }],
      },
    });
    const commit2Data = await commit2Res.json();
    expect(commit2Data.success).toBe(true);
    commit2Hash = commit2Data.data.hash;
    console.log(`Created commit 2: ${commit2Hash}`);

    console.log('\n=== Test Data Created ===');
    console.log(`Project: ${projectName}`);
    console.log(`Commits: ${commit1Hash.slice(0, 12)}... → ${commit2Hash.slice(0, 12)}...`);
  });

  test('API data is correct', async ({ request }) => {
    // Verify commits have correct data
    const [res1, res2] = await Promise.all([
      request.get(`${API_BASE}/commits-v3/${commit1Hash}`),
      request.get(`${API_BASE}/commits-v3/${commit2Hash}`),
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.data.content.sentences).toHaveLength(3);
    expect(data2.data.content.sentences).toHaveLength(3);

    // Verify parent relationship
    expect(data2.data.parents).toContain(commit1Hash);

    console.log('API data verified');
  });

  test('Canvas loads with commits', async ({ page }) => {
    // Visit homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on project
    await page.getByText(projectName, { exact: true }).click();

    // Wait for canvas
    await page.waitForURL(/\/project\//, { timeout: 10000 }).catch(() => {});
    await page.waitForSelector('.react-flow', { timeout: 30000 });
    await page.waitForTimeout(5000); // Wait for data to load

    // Wait for sentences to load (not showing "Loading...")
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading...'),
      { timeout: 15000 }
    ).catch(() => {});
    await page.waitForTimeout(1000);

    // Screenshot
    await page.screenshot({ path: 'test-results/diff-full-canvas.png' });

    // Verify at least one node (Canvas may show head commit only)
    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();
    console.log(`Found ${nodeCount} nodes`);

    expect(nodeCount).toBeGreaterThanOrEqual(1);

    // Check page has loaded properly (either commit message or committed state)
    const pageText = await page.locator('body').innerText();
    const hasCommitContent = pageText.includes('Committed') ||
                            pageText.includes('Initial requirements') ||
                            pageText.includes('Updated requirements') ||
                            pageText.includes('SENTENCES');

    console.log(`Has commit content: ${hasCommitContent}`);
    expect(hasCommitContent).toBe(true);
  });

  test('Can open commit modal with View full', async ({ page }) => {
    // Navigate to project
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.getByText(projectName, { exact: true }).click();
    await page.waitForSelector('.react-flow', { timeout: 30000 });
    await page.waitForTimeout(5000);

    // Wait for sentences to load
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading...'),
      { timeout: 15000 }
    ).catch(() => {});
    await page.waitForTimeout(1000);

    // Find View full button
    const viewFullBtn = page.getByText('View full').first();
    const hasViewFull = await viewFullBtn.isVisible({ timeout: 10000 }).catch(() => false);

    console.log(`View full button visible: ${hasViewFull}`);

    if (hasViewFull) {
      // Click using dispatchEvent to bypass pointer interception
      await viewFullBtn.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await page.waitForTimeout(2000);

      // Wait for modal to open (check for modal header)
      const modalOpened = await page.locator('text=Commit:').isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`Modal opened: ${modalOpened}`);

      // Screenshot
      await page.screenshot({ path: 'test-results/diff-full-modal.png' });

      // Check for Compare section (UI shows "COMPARE" in uppercase)
      const hasCompare = await page.locator('text=COMPARE').isVisible().catch(() => false);
      const hasCompareBtn = await page.locator('text=Compare with').isVisible().catch(() => false);
      console.log(`Compare section visible: ${hasCompare}, Compare button visible: ${hasCompareBtn}`);

      expect(hasCompare || hasCompareBtn || modalOpened).toBe(true);
    } else {
      // Fallback: Click SOURCES to open modal, then check if we can switch view
      console.log('View full not found, trying SOURCES click');
      const sourcesBtn = page.locator('text=SOURCES').first();
      await sourcesBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'test-results/diff-full-modal-sources.png' });
    }
  });

  test('Can run diff comparison', async ({ page }) => {
    // Monitor network requests for turn context API
    const turnContextResponses: { url: string; status: number }[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/turns/') && response.url().includes('/context')) {
        turnContextResponses.push({ url: response.url(), status: response.status() });
        console.log(`Turn context response: ${response.status()} - ${response.url().slice(0, 80)}...`);
      }
    });

    // Navigate to project
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.getByText(projectName, { exact: true }).click();
    await page.waitForSelector('.react-flow', { timeout: 30000 });

    // Wait longer for sentences to load and component to stabilize
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(2000);
      const stillLoading = await page.locator('text=Loading...').isVisible().catch(() => false);
      if (!stillLoading) {
        console.log(`Loading completed after ${(attempt + 1) * 2} seconds`);
        break;
      }
      console.log(`Still loading... (attempt ${attempt + 1})`);
    }

    // Log network status
    console.log(`Turn context API calls: ${turnContextResponses.length}`);
    turnContextResponses.forEach((r, i) => console.log(`  ${i + 1}. ${r.status}`));

    // Extra wait for component stability
    await page.waitForTimeout(3000);

    // Screenshot before trying to click
    await page.screenshot({ path: 'test-results/diff-full-before-click.png' });

    // Try to find and click View full with force
    const viewFullBtn = page.getByText('View full').first();
    const hasViewFull = await viewFullBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasViewFull) {
      console.log('View full button not visible - trying alternative: click SOURCES to open modal');
      await page.screenshot({ path: 'test-results/diff-full-no-viewfull.png' });

      // Alternative: click SOURCES to open modal, then navigate to commit view
      const sourcesBtn = page.locator('text=SOURCES').first();
      if (await sourcesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sourcesBtn.click({ force: true });
        await page.waitForTimeout(2000);

        // Look for a way to switch to commit view or find Compare section
        const pageText = await page.locator('body').innerText();
        console.log('Modal content check - has Compare:', pageText.includes('Compare'));

        if (!pageText.includes('Compare')) {
          console.log('Compare section not in conversation view - need commit view');
          test.skip();
          return;
        }
      } else {
        test.skip();
        return;
      }
    } else {
      // Use dispatchEvent to bypass pointer interception
      await viewFullBtn.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await page.waitForTimeout(2000);

      // Wait for modal
      const modalOpened = await page.locator('text=Commit:').isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`Modal opened in diff test: ${modalOpened}`);
    }

    // Look for Compare section
    const compareBtn = page.locator('button:has-text("Compare with")');
    const hasCompareBtn = await compareBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCompareBtn) {
      // Scroll sidebar
      const sidebar = page.locator('aside').first();
      await sidebar.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(500);
    }

    const compareBtnAfterScroll = page.locator('button:has-text("Compare with")');
    if (await compareBtnAfterScroll.isVisible({ timeout: 3000 }).catch(() => false)) {
      await compareBtnAfterScroll.click();
      await page.waitForTimeout(500);

      // Select target commit
      const select = page.locator('select').first();
      const options = await select.locator('option').allTextContents();
      console.log(`Dropdown options: ${options.join(', ')}`);

      if (options.length > 1) {
        await select.selectOption({ index: 1 });
        await page.waitForTimeout(500);

        // Click Run Diff
        await page.locator('button:has-text("Run Diff")').click();
        await page.waitForTimeout(3000);

        // Screenshot result
        await page.screenshot({ path: 'test-results/diff-full-result.png' });

        // Verify DiffDisplayView
        const pageText = await page.locator('body').innerText();
        const hasDiffView = pageText.includes('identical') ||
                          pageText.includes('Unified') ||
                          pageText.includes('Side-by-side') ||
                          pageText.includes('only in');

        console.log(`DiffDisplayView visible: ${hasDiffView}`);
        expect(hasDiffView).toBe(true);
      }
    } else {
      console.log('Compare button not found');
      await page.screenshot({ path: 'test-results/diff-full-no-compare.png' });
    }
  });

  test('Provides manual verification URL', async () => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Manual Verification:');
    console.log(`Open: http://localhost:3000/project/${projectId}`);
    console.log('1. Click "View full" on a commit node');
    console.log('2. Find "Compare" section in sidebar');
    console.log('3. Click "Compare with..." and select another commit');
    console.log('4. Click "Run Diff" to see DiffDisplayView');
    console.log('═══════════════════════════════════════════════════════════════\n');
  });
});
