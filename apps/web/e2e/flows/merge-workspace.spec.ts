import {
  API_BASE,
  cleanupProject,
  createTestCommit,
  createTestCommitFromTrees,
  createTestMergeDraft,
  createTestProject,
} from '../fixtures/api-helpers';
import { MERGE_SEMANTIC_CHANGES_DEMO } from '../fixtures/open-source-demo-datasets';
import { MergePage } from '../fixtures/page-objects/merge-page';
import { expect, test } from '../fixtures/test';

/**
 * Merge Workspace E2E Tests
 *
 * Tests the full merge resolution workflow including:
 * - Loading merge workspace with conflicts
 * - Resolving similar pairs (Keep A / Keep B)
 * - Toggling keep for source/target-only items
 * - Committing a merge
 * - Cancelling a merge
 */

// #4: Generate unique node IDs per test run
function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

test.describe('Merge Workspace', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let sourceHash: string;
  let targetHash: string;
  let mergeId: string;

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Merge E2E ${Date.now()}`);
    projectId = id;

    const baseHash = await createTestCommitFromTrees(
      request,
      projectId,
      MERGE_SEMANTIC_CHANGES_DEMO.base,
      { branch: 'main', message: 'Base commit' }
    );

    sourceHash = await createTestCommitFromTrees(
      request,
      projectId,
      MERGE_SEMANTIC_CHANGES_DEMO.source,
      { branch: 'feature', message: 'Feature commit', parents: [baseHash] }
    );

    targetHash = await createTestCommitFromTrees(
      request,
      projectId,
      MERGE_SEMANTIC_CHANGES_DEMO.target,
      { branch: 'main', message: 'Main commit', parents: [baseHash] }
    );

    mergeId = await createTestMergeDraft(request, projectId, sourceHash, targetHash, {
      sourceBranch: 'feature',
      targetBranch: 'main',
    });
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  // MW-01: Merge page loads with conflict sections
  test('MW-01: Merge page loads with conflicts', async ({ page }) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    const hasIdentical = await merge.hasIdenticalSection();
    const hasConflicts = await merge.hasConflictsSection();

    // Fixed open-source demo data must exercise both review paths.
    expect(hasIdentical || hasConflicts).toBe(true);
    expect(hasConflicts).toBe(true);
    await expect(page.getByText(`Conflicts (${MERGE_SEMANTIC_CHANGES_DEMO.expected.conflicts.length})`)).toBeVisible();

    // Commit should be disabled initially (no message, unresolved conflicts)
    const commitEnabled = await merge.isCommitEnabled();
    expect(commitEnabled).toBe(false);
  });

  // MW-02: Resolve a conflict by choosing source
  // #2: Use test.skip() instead of silent return
  test('MW-02: Resolve conflict with Keep A', async ({ page }) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    const hasConflicts = await merge.hasConflictsSection();
    expect(hasConflicts).toBe(true);

    const initialCount = await merge.getUnresolvedCount();
    expect(initialCount).toBe(MERGE_SEMANTIC_CHANGES_DEMO.expected.conflicts.length);

    // #5: Click and wait for UI state change, not fixed timeout
    const keepAButton = page
      .locator('button:has-text("Use feature")')
      .or(page.locator('button:has-text("Accept Source")'))
      .or(page.locator('button:has-text("Keep A")'))
      .first();
    await expect(keepAButton).toBeVisible({ timeout: 5000 });
    await keepAButton.click();

    // Wait for the conflict card to visually reflect the resolution (green border/check)
    // or for the unresolved count to update
    await expect(async () => {
      const newCount = await merge.getUnresolvedCount();
      expect(newCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 5000 });
  });

  // MW-03: Resolve a conflict by choosing target
  test('MW-03: Resolve conflict with Keep B', async ({ page }) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    const hasConflicts = await merge.hasConflictsSection();
    expect(hasConflicts).toBe(true);

    const initialCount = await merge.getUnresolvedCount();
    expect(initialCount).toBe(MERGE_SEMANTIC_CHANGES_DEMO.expected.conflicts.length);

    const keepBButton = page
      .locator('button:has-text("Use main")')
      .or(page.locator('button:has-text("Accept Target")'))
      .or(page.locator('button:has-text("Keep B")'))
      .first();
    await expect(keepBButton).toBeVisible({ timeout: 5000 });
    await keepBButton.click();

    // Verify the resolution was applied — unresolved count should decrease
    await expect(async () => {
      const newCount = await merge.getUnresolvedCount();
      expect(newCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 5000 });
  });

  // MW-04: Merge workspace sections and summary
  test('MW-04: Merge workspace sections, voices, and summary', async ({ page }, testInfo) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    // Wait for merge content to fully render (sections load after action bar)
    // The merge workspace should show CONFLICTS and/or AUTO-KEPT sections
    // Use broad locator: sidebar nav items contain section labels
    const sidebarItem = page.locator('nav, aside, [class*="sidebar"]').locator('text=/Conflict|Auto|Source|Target|Identical/i').first();
    const contentHeading = page.locator('h2, h3, [class*="heading"]').filter({ hasText: /Conflict|Auto-kept|Source only|Target only|Identical/i }).first();
    const summaryLabel = page.locator('text=/Auto-kept|Conflicts/').first();

    // At least one section indicator should be visible
    await expect(async () => {
      const hasSidebar = await sidebarItem.isVisible().catch(() => false);
      const hasHeading = await contentHeading.isVisible().catch(() => false);
      const hasSummary = await summaryLabel.isVisible().catch(() => false);
      expect(hasSidebar || hasHeading || hasSummary).toBe(true);
    }).toPass({ timeout: 10000 });

    const voicesPanel = page.getByTestId('merge-voices-panel');
    await expect(voicesPanel).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('merge-voice-agreements')).toContainText('Agreements');
    await expect(page.getByTestId('merge-voice-unique_to_source')).toContainText(
      'Unique to feature'
    );
    await expect(page.getByTestId('merge-voice-unique_to_target')).toContainText('Unique to main');
    await expect(page.getByTestId('merge-voice-tension')).toContainText(
      'Tension requiring judgment'
    );
    await expect(page.getByTestId('merge-voice-tension')).toContainText('Sydney and Hawaii');
    await expect(page.getByTestId('merge-voice-tension')).toContainText('Sydney and Tasmania');
    await expect(page.getByRole('button', { name: 'Use feature' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use main' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep both voices' }).first()).toBeVisible();

    await testInfo.attach('merge-voices-desktop', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });

  // MW-05: Commit merge (resolve all + fill message + commit)
  // #6, #7, #8: Mandatory commit — no conditional skip, verify resolution, isolated draft
  test('MW-05: Commit merge', async ({ request, page }) => {
    // #8: Delete any existing pending draft before creating a fresh one
    await request.delete(`${API_BASE}/merge/drafts/${mergeId}`).catch(() => {});
    const freshMergeId = await createTestMergeDraft(request, projectId, sourceHash, targetHash, {
      sourceBranch: 'feature',
      targetBranch: 'main',
    });

    const merge = new MergePage(page);
    await merge.goto(projectId, freshMergeId);
    await merge.waitForLoad();

    // Resolve all conflicts by choosing the source voice.
    // Buttons remain in DOM after resolution (just change style), so nth(i) is safe.
    // Use separate locators to avoid .or() count issues.
    let acceptButtons = page.locator('button:has-text("Use feature")');
    let count = await acceptButtons.count();
    if (count === 0) {
      acceptButtons = page
        .locator('button:has-text("Accept Source")')
        .or(page.locator('button:has-text("Keep A")'));
      count = await acceptButtons.count();
    }
    for (let i = 0; i < count; i++) {
      await acceptButtons.nth(i).click();
      await page.waitForTimeout(300);
    }

    // #7: Verify all conflicts are resolved — unresolved count should be 0
    if (count > 0) {
      await expect(async () => {
        const unresolvedCount = await merge.getUnresolvedCount();
        expect(unresolvedCount).toBe(0);
      }).toPass({ timeout: 5000 });
    }

    // Fill merge message
    await merge.setMessage('E2E merge test commit');

    // #5: Wait for auto-save "Saved" indicator instead of 3s timeout
    await merge.waitForSaved();

    // #6: Assert commit is enabled — if not, the test MUST fail (no conditional skip)
    await expect(merge.commitButton).toBeEnabled({ timeout: 5000 });

    // Commit the merge
    await merge.commit();
    await merge.waitForCommitCeremony();

    // Should redirect back to project canvas after the ceremony completes.
    await merge.waitForRedirect(/\/project\//, 15000);
    expect(page.url()).toContain(`/project/${projectId}`);
  });

  // MW-06: Cancel merge returns to canvas
  test('MW-06: Cancel merge', async ({ request, page }) => {
    // Create independent test data to avoid MW-05 state pollution
    const cancelPrefix = uid();
    const cancelBase = await createTestCommit(
      request,
      projectId,
      [{ id: `s_${cancelPrefix}_1`, text: 'Cancel test base' }],
      { branch: 'main', message: 'Cancel base' }
    );
    const cancelSource = await createTestCommit(
      request,
      projectId,
      [
        { id: `s_${cancelPrefix}_1`, text: 'Cancel test base' },
        { id: `s_${cancelPrefix}_2`, text: 'Cancel source only' },
      ],
      { branch: 'cancel-feature', message: 'Cancel source', parents: [cancelBase] }
    );
    const cancelTarget = await createTestCommit(
      request,
      projectId,
      [
        { id: `s_${cancelPrefix}_1`, text: 'Cancel test base' },
        { id: `s_${cancelPrefix}_3`, text: 'Cancel target only' },
      ],
      { branch: 'main', message: 'Cancel target', parents: [cancelBase] }
    );
    const cancelMergeId = await createTestMergeDraft(
      request,
      projectId,
      cancelSource,
      cancelTarget,
      { sourceBranch: 'cancel-feature', targetBranch: 'main' }
    );
    expect(cancelMergeId).toBeTruthy();

    const merge = new MergePage(page);
    await merge.goto(projectId, cancelMergeId);
    await merge.waitForLoad();

    await merge.cancel();

    await merge.waitForRedirect(/\/project\//, 10000);
    expect(page.url()).toContain(`/project/${projectId}`);
  });
});
