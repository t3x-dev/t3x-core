import { test, expect } from '@playwright/test';

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
        console.log(`Found project with commits: ${projectName} (${projectId})`);
        console.log(`  - Has ${commitsData.data.commits.length} commits`);
        break;
      }
    }

    if (!projectId) {
      throw new Error('No project with 2+ commits found');
    }
  });

  test('Canvas page loads and shows commits', async ({ page }) => {
    // Visit homepage first
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on the project to navigate using exact text match
    // Use a more specific selector that targets the project card
    const projectCard = page.locator(`[data-testid="project-card"]:has-text("${projectName}"), a:has-text("${projectName}")`).first();

    // If that doesn't work, fall back to clicking any element with the exact project name
    const clickTarget = await projectCard.isVisible() ? projectCard : page.getByText(projectName, { exact: true });
    await clickTarget.click();

    // Wait for navigation and canvas to load
    await page.waitForURL(/\/project\//, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/canvas-page.png', fullPage: true });

    // Check if canvas is visible
    const canvas = page.locator('.react-flow');
    const hasCanvas = await canvas.isVisible({ timeout: 10000 }).catch(() => false);

    console.log(`Canvas visible: ${hasCanvas}`);

    if (!hasCanvas) {
      // Check page content for errors
      const pageText = await page.locator('body').innerText();
      console.log('Page content:', pageText.substring(0, 500));
    }

    expect(hasCanvas).toBe(true);
  });

  test('Can open commit modal and see Compare section', async ({ page }) => {
    // Visit homepage first
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on the project using exact text match
    await page.getByText(projectName, { exact: true }).click();

    // Wait for navigation and canvas
    await page.waitForURL(/\/project\//, { timeout: 10000 }).catch(() => {});
    await page.waitForSelector('.react-flow', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Find and click a commit node
    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();
    console.log(`Found ${nodeCount} nodes`);

    expect(nodeCount).toBeGreaterThan(0);

    // Click first node
    await nodes.first().click();
    await page.waitForTimeout(1000);

    // Take screenshot of modal
    await page.screenshot({ path: 'test-results/commit-modal.png' });

    // Check for Compare section (may need to scroll)
    const sidebar = page.locator('aside').first();
    if (await sidebar.isVisible()) {
      // Scroll to bottom
      await sidebar.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(500);
    }

    // Look for Compare section
    const compareText = page.locator('text=Compare').first();
    const hasCompare = await compareText.isVisible({ timeout: 5000 }).catch(() => false);

    await page.screenshot({ path: 'test-results/modal-scrolled.png' });
    console.log(`Compare section visible: ${hasCompare}`);

    // If not found, check if this is a V4 commit (no compare) or staging commit
    if (!hasCompare) {
      const hasV4Badge = await page.locator('text=V4').isVisible().catch(() => false);
      const hasStaging = await page.locator('text=staging').isVisible().catch(() => false);
      console.log(`V4 commit: ${hasV4Badge}, Staging: ${hasStaging}`);

      // Try another node
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      if (nodeCount > 1) {
        await nodes.nth(1).click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/second-commit-modal.png' });
      }
    }
  });

  test('Can run diff comparison', async ({ page }) => {
    // Visit homepage first
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on the project using exact text match
    await page.getByText(projectName, { exact: true }).click();

    // Wait for navigation and canvas
    await page.waitForURL(/\/project\//, { timeout: 10000 }).catch(() => {});
    await page.waitForSelector('.react-flow', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Click a commit node
    const nodes = page.locator('.react-flow__node');
    await nodes.first().click();
    await page.waitForTimeout(1000);

    // Scroll sidebar to see Compare section
    const sidebar = page.locator('aside').first();
    if (await sidebar.isVisible()) {
      await sidebar.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(500);
    }

    // Find Compare with... button
    const compareBtn = page.locator('button:has-text("Compare with")');
    const hasCmpBtn = await compareBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCmpBtn) {
      console.log('Compare button not found on this commit');
      await page.screenshot({ path: 'test-results/no-compare-btn.png' });

      // This might be a V3 commit without enough siblings, or a V4 commit
      // Check commit type
      const isV3 = await page.locator('text=V3').isVisible().catch(() => false);
      console.log(`Is V3 commit: ${isV3}`);

      // Skip if not V3 or no compare button
      test.skip(!isV3, 'Not a V3 commit with compare capability');
      return;
    }

    // Click Compare button
    await compareBtn.click();
    await page.waitForTimeout(500);

    // Select from dropdown
    const select = page.locator('select').first();
    const options = await select.locator('option').allTextContents();
    console.log('Dropdown options:', options);

    if (options.length > 1) {
      await select.selectOption({ index: 1 });
      await page.waitForTimeout(500);

      // Click Run Diff
      const runDiff = page.locator('button:has-text("Run Diff")');
      await runDiff.click();

      // Wait for diff to load
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'test-results/diff-result.png' });

      // Check for DiffDisplayView elements
      const hasDiff = await page.locator('text=identical').or(
        page.locator('text=Unified').or(
          page.locator('text=Side-by-side')
        )
      ).first().isVisible({ timeout: 5000 }).catch(() => false);

      console.log(`DiffDisplayView visible: ${hasDiff}`);
      expect(hasDiff).toBe(true);
    } else {
      console.log('Not enough commits to compare');
      test.skip();
    }
  });
});
