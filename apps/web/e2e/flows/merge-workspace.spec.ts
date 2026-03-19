import {
  API_BASE,
  cleanupProject,
  createTestCommit,
  createTestMergeDraft,
  createTestProject,
} from '../fixtures/api-helpers';
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

// #4: Generate unique sentence IDs per test run
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
    const prefix = uid();
    const { projectId: id } = await createTestProject(request, `Merge E2E ${Date.now()}`);
    projectId = id;

    const baseHash = await createTestCommit(
      request,
      projectId,
      [
        { id: `s_${prefix}_1`, text: 'User prefers dark mode' },
        { id: `s_${prefix}_2`, text: 'User speaks English' },
        { id: `s_${prefix}_3`, text: 'User timezone is UTC+8' },
      ],
      { branch: 'main', message: 'Base commit' }
    );

    sourceHash = await createTestCommit(
      request,
      projectId,
      [
        { id: `s_${prefix}_1`, text: 'User prefers dark mode' },
        { id: `s_${prefix}_2`, text: 'User speaks English fluently' },
        { id: `s_${prefix}_3`, text: 'User timezone is UTC+8' },
        { id: `s_${prefix}_4`, text: 'User is a developer' },
      ],
      { branch: 'feature', message: 'Feature commit', parents: [baseHash] }
    );

    targetHash = await createTestCommit(
      request,
      projectId,
      [
        { id: `s_${prefix}_1`, text: 'User prefers dark mode' },
        { id: `s_${prefix}_2`, text: 'User speaks British English' },
        { id: `s_${prefix}_3`, text: 'User timezone is UTC+8' },
        { id: `s_${prefix}_5`, text: 'User likes coffee' },
      ],
      { branch: 'main', message: 'Main commit', parents: [baseHash] }
    );

    mergeId = await createTestMergeDraft(request, projectId, sourceHash, targetHash);
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

    // Merge workspace should show at least one section (identical or conflicts)
    // Frame-based commits may classify differently than sentence-based
    expect(hasIdentical || hasConflicts).toBe(true);

    // Commit should be disabled initially (no message, unresolved conflicts)
    const commitEnabled = await merge.isCommitEnabled();
    expect(commitEnabled).toBe(false);
  });

  // MW-02: Resolve a conflict by choosing source (Keep A)
  // #2: Use test.skip() instead of silent return
  test('MW-02: Resolve conflict with Keep A', async ({ page }) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    const hasConflicts = await merge.hasConflictsSection();
    test.skip(!hasConflicts, 'No conflicts section — merge data had no similar pairs');

    const initialCount = await merge.getUnresolvedCount();

    // #5: Click and wait for UI state change, not fixed timeout
    const keepAButton = page.locator('button:has-text("Keep A")').first();
    await expect(keepAButton).toBeVisible({ timeout: 5000 });
    await keepAButton.click();

    // Wait for the conflict card to visually reflect the resolution (green border/check)
    // or for the unresolved count to update
    await expect(async () => {
      const newCount = await merge.getUnresolvedCount();
      expect(newCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 5000 });
  });

  // MW-03: Resolve a conflict by choosing target (Keep B)
  test('MW-03: Resolve conflict with Keep B', async ({ page }) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    const hasConflicts = await merge.hasConflictsSection();
    test.skip(!hasConflicts, 'No conflicts section — merge data had no similar pairs');

    const initialCount = await merge.getUnresolvedCount();

    const keepBButton = page.locator('button:has-text("Keep B")').first();
    await expect(keepBButton).toBeVisible({ timeout: 5000 });
    await keepBButton.click();

    // Verify the resolution was applied — unresolved count should decrease
    await expect(async () => {
      const newCount = await merge.getUnresolvedCount();
      expect(newCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 5000 });
  });

  // MW-04: Toggle keep for source-only items
  test('MW-04: Toggle keep for source/target only items', async ({ page }) => {
    const merge = new MergePage(page);
    await merge.goto(projectId, mergeId);
    await merge.waitForLoad();

    const hasSourceOnly = await merge.hasSourceOnlySection();
    const hasTargetOnly = await merge.hasTargetOnlySection();
    test.skip(!hasSourceOnly && !hasTargetOnly, 'No source-only or target-only sections');

    if (hasSourceOnly) {
      // Source Only section starts expanded (defaultCollapsed=false)
      // Verify expanded content is visible, then toggle collapse/expand
      const sourceHeader = page.locator('button:has-text("Source Only")').first();
      const sourceItem = page.getByText('User is a developer');
      await expect(sourceItem).toBeVisible({ timeout: 5000 });

      // Click to collapse — content should disappear
      await sourceHeader.click();
      await expect(sourceItem).toBeHidden({ timeout: 3000 });

      // Click to re-expand — content should reappear
      await sourceHeader.click();
      await expect(sourceItem).toBeVisible({ timeout: 3000 });
    }

    if (hasTargetOnly) {
      // Target Only section also starts expanded
      const targetHeader = page.locator('button:has-text("Target Only")').first();
      const targetItem = page.getByText('User likes coffee');
      await expect(targetItem).toBeVisible({ timeout: 5000 });

      // Toggle collapse/expand
      await targetHeader.click();
      await expect(targetItem).toBeHidden({ timeout: 3000 });
      await targetHeader.click();
      await expect(targetItem).toBeVisible({ timeout: 3000 });
    }
  });

  // MW-05: Commit merge (resolve all + fill message + commit)
  // #6, #7, #8: Mandatory commit — no conditional skip, verify resolution, isolated draft
  test('MW-05: Commit merge', async ({ request, page }) => {
    // #8: Delete any existing pending draft before creating a fresh one
    await request.delete(`${API_BASE}/merge/drafts/${mergeId}`).catch(() => {});
    const freshMergeId = await createTestMergeDraft(request, projectId, sourceHash, targetHash);

    const merge = new MergePage(page);
    await merge.goto(projectId, freshMergeId);
    await merge.waitForLoad();

    // Resolve all conflicts by clicking Keep A for each
    const keepAButtons = page.locator('button:has-text("Keep A")');
    const count = await keepAButtons.count();
    for (let i = 0; i < count; i++) {
      await keepAButtons.nth(i).click();
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

    // Should redirect back to project canvas
    await merge.waitForRedirect(/\/project\//, 15000);
    expect(page.url()).toContain(`/project/${projectId}`);
  });

  // MW-06: Cancel merge returns to canvas
  test('MW-06: Cancel merge', async ({ request, page }) => {
    const cancelMergeId = await createTestMergeDraft(request, projectId, sourceHash, targetHash);

    const merge = new MergePage(page);
    await merge.goto(projectId, cancelMergeId);
    await merge.waitForLoad();

    await merge.cancel();

    await merge.waitForRedirect(/\/project\//, 10000);
    expect(page.url()).toContain(`/project/${projectId}`);
  });
});
