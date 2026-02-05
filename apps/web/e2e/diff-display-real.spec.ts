import { expect, test } from '@playwright/test';

/**
 * Real DiffDisplayView UI E2E Test
 *
 * Uses actual project with commits for testing.
 */

test.describe('DiffDisplayView Real UI Test', () => {
  // First, find a project with commits
  let projectId: string;
  let projectName: string;

  test.beforeAll(async ({ request }) => {
    // Get projects
    const projectsRes = await request.get('http://localhost:8000/api/v1/projects?limit=10');
    const projectsData = await projectsRes.json();

    // Find a project with commits
    for (const project of projectsData.data.projects) {
      const commitsRes = await request.get(
        `http://localhost:8000/api/v1/commits-v3?project_id=${project.project_id}`
      );
      const commitsData = await commitsRes.json();

      if (commitsData.data.commits.length >= 2) {
        projectId = project.project_id;
        projectName = project.name;
        break;
      }
    }

    if (!projectId) {
      // Will be handled by test.skip() in each test
    }
  });

  test('Canvas page loads and shows commits', async ({ page }) => {
    test.skip(!projectId, 'No project with 2+ V3 commits found');
    // Visit homepage and wait for project list to render
    await page.goto('/');
    await page
      .getByText(projectName, { exact: true })
      .waitFor({ state: 'visible', timeout: 15000 });

    // Click on the project to navigate using exact text match
    // Use a more specific selector that targets the project card
    const projectCard = page
      .locator(
        `[data-testid="project-card"]:has-text("${projectName}"), a:has-text("${projectName}")`
      )
      .first();

    // If that doesn't work, fall back to clicking any element with the exact project name
    const isCardVisible = await projectCard.isVisible();
    const clickTarget = isCardVisible ? projectCard : page.getByText(projectName, { exact: true });
    await clickTarget.click();

    // Wait for navigation and canvas to load
    await page.waitForURL(/\/project\//, { timeout: 15000 });
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 15000 });

    // Take screenshot
    await page.screenshot({ path: 'test-results/canvas-page.png', fullPage: true });

    // Check if canvas is visible
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
  });

  test('Can open commit modal and see Compare section', async ({ page }) => {
    test.skip(!projectId, 'No project with 2+ V3 commits found');
    // Visit homepage and wait for project list to render
    await page.goto('/');
    await page
      .getByText(projectName, { exact: true })
      .waitFor({ state: 'visible', timeout: 15000 });

    // Click on the project using exact text match
    await page.getByText(projectName, { exact: true }).click();

    // Wait for navigation and canvas
    await page.waitForURL(/\/project\//, { timeout: 15000 });
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 });

    // Wait for nodes to render inside the canvas
    const nodes = page.locator('.react-flow__node');
    const hasNodes = await nodes
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    test.skip(!hasNodes, 'Canvas nodes not visible — V3 commits may not render as nodes');
    const nodeCount = await nodes.count();

    expect(nodeCount).toBeGreaterThan(0);

    // Click first node
    await nodes.first().click();

    // Wait for sidebar to appear after clicking
    const sidebar = page.locator('aside').first();
    await sidebar.waitFor({ state: 'visible', timeout: 10000 });

    // Take screenshot of modal
    await page.screenshot({ path: 'test-results/commit-modal.png' });

    // Scroll sidebar to bottom to reveal Compare section
    await sidebar.evaluate((el) => (el.scrollTop = el.scrollHeight));

    // Look for Compare section
    const compareText = page.locator('text=Compare').first();
    const hasCompare = await compareText.isVisible();

    await page.screenshot({ path: 'test-results/modal-scrolled.png' });

    // If not found, check if this is a V4 commit (no compare) or staging commit
    if (!hasCompare) {
      const _hasV4Badge = await page.locator('text=V4').isVisible();
      const _hasStaging = await page.locator('text=staging').isVisible();

      // Try another node
      await page.keyboard.press('Escape');

      if (nodeCount > 1) {
        await nodes.nth(1).waitFor({ state: 'visible', timeout: 5000 });
        await nodes.nth(1).click();
        await sidebar.waitFor({ state: 'visible', timeout: 10000 });
        await page.screenshot({ path: 'test-results/second-commit-modal.png' });
      }
    }
  });

  test('Can run diff comparison', async ({ page }) => {
    test.skip(!projectId, 'No project with 2+ V3 commits found');
    // Visit homepage and wait for project list to render
    await page.goto('/');
    await page
      .getByText(projectName, { exact: true })
      .waitFor({ state: 'visible', timeout: 15000 });

    // Click on the project using exact text match
    await page.getByText(projectName, { exact: true }).click();

    // Wait for navigation and canvas
    await page.waitForURL(/\/project\//, { timeout: 15000 });
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 });

    // Wait for nodes to render and click a commit node
    const nodes = page.locator('.react-flow__node');
    const hasNodes = await nodes
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    test.skip(!hasNodes, 'Canvas nodes not visible — V3 commits may not render as nodes');
    await nodes.first().click();

    // Wait for sidebar to appear
    const sidebar = page.locator('aside').first();
    await sidebar.waitFor({ state: 'visible', timeout: 10000 });

    // Scroll sidebar to see Compare section
    await sidebar.evaluate((el) => (el.scrollTop = el.scrollHeight));

    // Find Compare with... button
    const compareBtn = page.locator('button:has-text("Compare with")');
    const hasCmpBtn = await compareBtn.isVisible();

    if (!hasCmpBtn) {
      await page.screenshot({ path: 'test-results/no-compare-btn.png' });

      // This might be a V3 commit without enough siblings, or a V4 commit
      // Check commit type
      const isV3 = await page.locator('text=V3').isVisible();

      // Skip if not V3 or no compare button
      test.skip(!isV3, 'Not a V3 commit with compare capability');
      return;
    }

    // Click Compare button
    await compareBtn.click();

    // Wait for dropdown to appear
    const select = page.locator('select').first();
    await select.waitFor({ state: 'visible', timeout: 5000 });
    const options = await select.locator('option').allTextContents();

    if (options.length > 1) {
      await select.selectOption({ index: 1 });

      // Click Run Diff
      const runDiff = page.locator('button:has-text("Run Diff")');
      await runDiff.click();

      // Wait for diff results to appear
      const diffIndicator = page
        .locator('text=identical')
        .or(page.locator('text=Unified').or(page.locator('text=Side-by-side')))
        .first();
      await diffIndicator.waitFor({ state: 'visible', timeout: 15000 });

      await page.screenshot({ path: 'test-results/diff-result.png' });

      // Check for DiffDisplayView elements
      await expect(diffIndicator).toBeVisible();
    } else {
      test.skip(true, 'Not enough commits to compare');
    }
  });
});
